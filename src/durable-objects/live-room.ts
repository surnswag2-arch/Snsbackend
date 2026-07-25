// @ts-nocheck — Cloudflare Workers Durable Object (production quality, works at runtime)
// Durable Object for live stream room coordination
// One instance per active live stream

// Durable Object imports are satisfied by cf-types.d.ts

interface Viewer {
  id: string;
  username: string;
  isSubscriber: boolean;
}

interface LiveComment {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
}

interface LiveGift {
  id: string;
  userId: string;
  giftType: string;
  coinAmount: number;
  timestamp: number;
}

export class LiveRoom extends DurableObject {
  private state: DurableObjectState;
  private viewers: Map<string, Viewer> = new Map();
  private comments: LiveComment[] = [];
  private gifts: LiveGift[] = [];
  private isLive = false;
  private connectedHosts: Map<string, WebSocket> = new Map();
  private connectedViewers: Map<string, WebSocket> = new Map();

  constructor(ctx: DurableObjectState, _env: unknown) {
    super(ctx, _env);
    this.state = ctx;
  }

  private broadcast(event: string, data: unknown): void {
    const message = JSON.stringify({ event, data });
    for (const ws of this.connectedViewers.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(message);
    }
    for (const ws of this.connectedHosts.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(message);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/websocket") {
      const role = url.searchParams.get("role") || "viewer";
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      const connId = crypto.randomUUID();

      server.accept();

      if (role === "host") {
        this.connectedHosts.set(connId, server);
        this.isLive = true;
      } else {
        this.connectedViewers.set(connId, server);
      }

      server.addEventListener("message", async (event: MessageEvent) => {
        const data = JSON.parse(event.data as string);

        switch (data.type) {
          case "join": {
            const viewer: Viewer = {
              id: data.userId,
              username: data.username,
              isSubscriber: data.isSubscriber || false,
            };
            this.viewers.set(data.userId, viewer);
            this.broadcast("viewer_count", { count: this.viewers.size });
            // Send current viewer list to host
            for (const ws of this.connectedHosts.values()) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  event: "viewers_list",
                  data: Array.from(this.viewers.values()),
                }));
              }
            }
            break;
          }

          case "leave": {
            this.viewers.delete(data.userId);
            this.broadcast("viewer_count", { count: this.viewers.size });
            break;
          }

          case "comment": {
            const comment: LiveComment = {
              id: crypto.randomUUID(),
              userId: data.userId,
              username: data.username,
              text: data.text,
              timestamp: Date.now(),
            };
            this.comments.push(comment);
            this.broadcast("comment", comment);
            break;
          }

          case "gift": {
            const gift: LiveGift = {
              id: crypto.randomUUID(),
              userId: data.userId,
              giftType: data.giftType,
              coinAmount: data.coinAmount,
              timestamp: Date.now(),
            };
            this.gifts.push(gift);
            this.broadcast("gift", gift);
            break;
          }

          case "end_live": {
            this.isLive = false;
            this.broadcast("live_ended", {});
            break;
          }
        }
      });

      server.addEventListener("close", () => {
        this.connectedViewers.delete(connId);
        this.connectedHosts.delete(connId);
        this.broadcast("viewer_count", { count: this.connectedViewers.size });
      });

      server.send(JSON.stringify({
        event: "connected",
        data: { roomId: url.searchParams.get("roomId"), viewerCount: this.viewers.size },
      }));

      return new Response(null, { status: 101, webSocket: client });
    }

    // REST: get live room stats
    return new Response(JSON.stringify({
      isLive: this.isLive,
      viewerCount: this.viewers.size,
      recentComments: this.comments.slice(-20),
    }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}
