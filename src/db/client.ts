// Supabase REST API client — works from Cloudflare Workers (no Node.js SDK needed)

export interface QueryFilter {
  column: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "like" | "ilike" | "cs" | "ov";
  value: unknown;
}

export class SupabaseClient {
  private url: string;
  private serviceKey: string;

  constructor(env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }) {
    this.url = env.SUPABASE_URL;
    this.serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  }

  private headers(prefer = "return=representation") {
    return {
      "Content-Type": "application/json",
      "apikey": this.serviceKey,
      "Authorization": `Bearer ${this.serviceKey}`,
      Prefer: prefer,
    };
  }

  private buildQuery(
    table: string,
    filters?: QueryFilter[],
    order?: { column: string; direction?: "asc" | "desc" },
    limit?: number,
    offset?: number,
    select?: string,
  ): string {
    const params = new URLSearchParams();
    if (select) params.set("select", select);
    if (filters) {
      for (const f of filters) {
        if (f.operator === "in") {
          params.set(`${f.column}`, `in.(${(f.value as string[]).join(",")})`);
        } else {
          params.set(`${f.column}`, `${f.operator}.${f.value}`);
        }
      }
    }
    if (order) {
      params.set("order", `${order.column}.${order.direction || "desc"}.nullsfirst`);
    }
    if (limit !== undefined) params.set("limit", String(limit));
    if (offset !== undefined) params.set("offset", String(offset));
    const qs = params.toString();
    return `${this.url}/rest/v1/${table}${qs ? `?${qs}` : ""}`;
  }

  async select<T>(
    table: string,
    filters?: QueryFilter[],
    order?: { column: string; direction?: "asc" | "desc" },
    limit?: number,
    offset?: number,
    select = "*",
  ): Promise<T[]> {
    const url = this.buildQuery(table, filters, order, limit, offset, select);
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`Supabase select ${table} failed: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T[]>;
  }

  async selectSingle<T>(
    table: string,
    filters?: QueryFilter[],
    select = "*",
  ): Promise<T | null> {
    const rows = await this.select<T>(table, filters, undefined, 1, undefined, select);
    return rows[0] || null;
  }

  async insert<T>(table: string, data: Record<string, unknown>, select = "*"): Promise<T[]> {
    const url = `${this.url}/rest/v1/${table}?select=${select}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Supabase insert ${table} failed: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T[]>;
  }

  async insertSingle<T>(table: string, data: Record<string, unknown>, select = "*"): Promise<T> {
    const rows = await this.insert<T>(table, data, select);
    return rows[0];
  }

  async update<T>(
    table: string,
    filters: QueryFilter[],
    data: Record<string, unknown>,
    select = "*",
  ): Promise<T[]> {
    const url = this.buildQuery(table, filters, undefined, undefined, undefined, select);
    const res = await fetch(url, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Supabase update ${table} failed: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T[]>;
  }

  async updateSingle<T>(table: string, filters: QueryFilter[], data: Record<string, unknown>, select = "*"): Promise<T | null> {
    const rows = await this.update<T>(table, filters, data, select);
    return rows[0] || null;
  }

  async delete_(table: string, filters: QueryFilter[]): Promise<void> {
    const url = this.buildQuery(table, filters);
    const res = await fetch(url, { method: "DELETE", headers: this.headers("return=minimal") });
    if (!res.ok) throw new Error(`Supabase delete ${table} failed: ${res.status} ${res.statusText}`);
  }

  async rpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
    const url = `${this.url}/rest/v1/rpc/${fn}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: params ? JSON.stringify(params) : undefined,
    });
    if (!res.ok) throw new Error(`Supabase rpc ${fn} failed: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  async count(table: string, filters?: QueryFilter[]): Promise<number> {
    const url = this.buildQuery(table, filters, undefined, 0, 0, "");
    const res = await fetch(url, {
      method: "HEAD",
      headers: { ...this.headers("return=minimal"), Prefer: "count=exact" },
    });
    if (!res.ok) throw new Error(`Supabase count ${table} failed: ${res.status} ${res.statusText}`);
    return Number(res.headers.get("content-range")?.split("/")[1] || 0);
  }
}
