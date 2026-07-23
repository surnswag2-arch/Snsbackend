// Meilisearch search service wrapper

export class SearchService {
  private url: string;
  private apiKey: string;

  constructor(env: { MEILISEARCH_URL: string; MEILISEARCH_API_KEY: string }) {
    this.url = env.MEILISEARCH_URL;
    this.apiKey = env.MEILISEARCH_API_KEY;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.url}/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`Meilisearch request failed: ${response.statusText}`);
    return response.json() as T;
  }

  // ── Index management ──
  async ensureIndex(indexName: string, primaryKey?: string): Promise<void> {
    const indexes = await this.request<{ uid: string }[]>("GET", "indexes");
    if (!indexes.find((i) => i.uid === indexName)) {
      await this.request("POST", "indexes", { uid: indexName, primaryKey: primaryKey || "id" });
    }
  }

  // ── Document indexing ──
  async indexDocuments(indexName: string, documents: unknown[]): Promise<void> {
    await this.request("POST", `indexes/${indexName}/documents`, documents);
  }

  async deleteDocument(indexName: string, id: string): Promise<void> {
    await this.request("DELETE", `indexes/${indexName}/documents/${id}`);
  }

  // ── Search ──
  async search<T>(indexName: string, query: string, options?: {
    limit?: number;
    offset?: number;
    filter?: string[];
    sort?: string[];
  }): Promise<{ hits: T[]; totalHits: number; totalPages: number }> {
    const result = await this.request<{ hits: T[]; totalHits: number; totalPages: number }>(
      "POST",
      `indexes/${indexName}/search`,
      {
        q: query,
        limit: options?.limit || 20,
        offset: options?.offset || 0,
        filter: options?.filter,
        sort: options?.sort,
      },
    );
    return result;
  }

  // ── Video search ──
  async searchVideos(query: string, limit = 20) {
    return this.search("videos", query, { limit, sort: ["created_at:desc"] });
  }

  async searchUsers(query: string, limit = 20) {
    return this.search("users", query, { limit });
  }

  async searchSounds(query: string, limit = 20) {
    return this.search("sounds", query, { limit });
  }

  async searchHashtags(query: string, limit = 20) {
    return this.search("hashtags", query, { limit });
  }
}
