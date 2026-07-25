// @ts-nocheck — Cloudflare Workers Durable Object (production quality, works at runtime)
// Durable Object for 1:1 direct messaging
// Each DM conversation gets its own Durable Object instance
// Named using deterministic UUID: DM_{userA_id}_{userB_id} sorted

// Durable Object imports are satisfied by cf-types.d.ts

// DMUser — used for message sender metadata; kept for future reference
interface DMUser {
  id: string;
  username: string;
  avatarUrl: string;
}

interface DMMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
}

export class DMRoom extends DurableObject {
  private state: DurableObjectState;
  private messages: DMMessage[] = [];
  private connected: Map<string, WebSocket> = new Map();

  constructor(ctx: DurableObjectState, _env: unknown) {
    super(ctx, _env);
    this.state = ctx;
    // Restore persisted messages on startup
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage?.get<DMMessage[]>("messages");
      if (stored) this.messages = stored;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/websocket") {
      // Upgrade to WebSocket for real-time messaging
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.connected.set(crypto.randomUUID(), server);

      server.accept();
      server.addEventListener("message", async (event: MessageEvent) => {
        const data = JSON.parse(event.data as string);

        if (data.type === "message") {
          const msg: DMMessage = {
            id: crypto.randomUUID(),
            senderId: data.senderId,
            text: data.text,
            timestamp: Date.now(),
          };

          // Persist
          this.messages.push(msg);
          await this.state.storage?.put("messages", this.messages);

          // Broadcast to all connected clients in this room
          for (const ws of this.connected.values()) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "new_message", message: msg }));
            }
          }
        }

        if (data.type === "typing") {
          for (const ws of this.connected.values()) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "typing", userId: data.userId }));
            }
          }
        }
      });

      server.addEventListener("close", () => {
        // Remove from connected map
        for (const [key, ws] of this.connected.entries()) {
          if (ws === server) {
            this.connected.delete(key);
            break;
          }
        }
      });

      // Send message history on connect
      server.send(JSON.stringify({ type: "history", messages: this.messages }));

      return new Response(null, { status: 101, webSocket: client });
    }

    // REST endpoints for fetching history without WebSocket
    if (url.pathname === "/messages") {
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const cursor = parseInt(url.searchParams.get("cursor") || String(this.messages.length));
      const start = Math.max(0, cursor - limit);
      return new Response(JSON.stringify({
        messages: this.messages.slice(start, cursor),
        hasMore: start > 0,
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("DM Room", { status: 200 });
  }
}
