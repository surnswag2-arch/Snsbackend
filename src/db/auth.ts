// Supabase Auth helpers — JWT verification via JWKS, OTP, OAuth flows
// Works in Cloudflare Workers using Web Crypto API

import type { AuthenticatedUser } from "../config";

interface JwkKey {
  kty: string;
  kid: string;
  alg: string;
  n: string;
  e: string;
  use: string;
}

interface JwksResponse {
  keys: JwkKey[];
}

interface JwtHeader {
  alg: string;
  typ: string;
  kid: string;
}

interface JwtPayload {
  sub: string;
  email?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  user_metadata?: {
    username?: string;
    locale?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export class SupabaseAuth {
  private supabaseUrl: string;
  private anonKey: string;
  private jwksCache: { keys: JwkKey[]; expiry: number } | null = null;
  private textEncoder = new TextEncoder();

  constructor(env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string }) {
    this.supabaseUrl = env.SUPABASE_URL;
    this.anonKey = env.SUPABASE_ANON_KEY;
  }

  private async fetchJwks(): Promise<JwkKey[]> {
    if (this.jwksCache && this.jwksCache.expiry > Date.now()) {
      return this.jwksCache.keys;
    }

    const res = await fetch(`${this.supabaseUrl}/auth/v1/.well-known/jwks.json`);
    if (!res.ok) throw new Error("Failed to fetch JWKS");
    const data: JwksResponse = await res.json();
    this.jwksCache = { keys: data.keys, expiry: Date.now() + 3600000 }; // 1h cache
    return data.keys;
  }

  private base64UrlDecode(input: string): Uint8Array {
    const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const padding = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
    return Uint8Array.from(atob(base64 + padding), (c) => c.charCodeAt(0));
  }

  async verifyToken(token: string): Promise<AuthenticatedUser> {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid JWT format");

    const header: JwtHeader = JSON.parse(new TextDecoder().decode(this.base64UrlDecode(parts[0])));
    const payload: JwtPayload = JSON.parse(new TextDecoder().decode(this.base64UrlDecode(parts[1])));
    const signature = this.base64UrlDecode(parts[2]);

    // Check expiry
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      throw new Error("Token expired");
    }

    // Verify signature using JWKS
    const keys = await this.fetchJwks();
    const keyData = keys.find((k) => k.kid === header.kid);
    if (!keyData) throw new Error("No matching JWK key found");

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      { kty: keyData.kty, n: keyData.n, e: keyData.e, alg: header.alg },
      { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
      false,
      ["verify"],
    );

    const data = this.textEncoder.encode(`${parts[0]}.${parts[1]}`);
    const isValid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, data);
    if (!isValid) throw new Error("Invalid JWT signature");

    return {
      id: payload.sub,
      email: payload.email,
      username: payload.user_metadata?.username || "unknown",
      locale: payload.user_metadata?.locale || "bn",
    };
  }

  // Sign in with email + password
  async signInWithPassword(email: string, password: string): Promise<{ access_token: string; refresh_token: string; user: AuthenticatedUser }> {
    const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.anonKey },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error_description?: string; msg?: string }).error_description || (err as { msg?: string }).msg || "Invalid credentials");
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      user: { id: string; email?: string; user_metadata?: { username?: string; locale?: string } };
    };
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        username: data.user.user_metadata?.username || "unknown",
        locale: data.user.user_metadata?.locale || "bn",
      },
    };
  }

  // Sign up with email + password
  async signUp(email: string, password: string, metadata?: Record<string, unknown>): Promise<{ access_token?: string; user_id: string }> {
    const res = await fetch(`${this.supabaseUrl}/auth/v1/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.anonKey },
      body: JSON.stringify({ email, password, data: metadata }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { msg?: string }).msg || "Signup failed");
    }
    const data = (await res.json()) as { access_token?: string; id: string };
    return { access_token: data.access_token, user_id: data.id };
  }

  // Send OTP
  async sendOtp(phone: string): Promise<void> {
    const res = await fetch(`${this.supabaseUrl}/auth/v1/otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.anonKey },
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) throw new Error("Failed to send OTP");
  }

  // Verify OTP
  async verifyOtp(phone: string, token: string): Promise<{ access_token: string; refresh_token: string }> {
    const res = await fetch(`${this.supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.anonKey },
      body: JSON.stringify({ phone, token, type: "sms" }),
    });
    if (!res.ok) throw new Error("Invalid or expired OTP");
    const data = (await res.json()) as { access_token: string; refresh_token: string };
    return data;
  }

  // Sign in with ID token (OAuth)
  async signInWithIdToken(provider: string, token: string): Promise<{ access_token: string; refresh_token: string; user: AuthenticatedUser }> {
    const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=id_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.anonKey },
      body: JSON.stringify({ id_token: token, provider }),
    });
    if (!res.ok) throw new Error("OAuth login failed");
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      user: { id: string; email?: string; user_metadata?: { username?: string; locale?: string } };
    };
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        username: data.user.user_metadata?.username || "unknown",
        locale: data.user.user_metadata?.locale || "bn",
      },
    };
  }

  // Refresh token
  async refreshToken(refresh_token: string): Promise<{ access_token: string; refresh_token: string }> {
    const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.anonKey },
      body: JSON.stringify({ refresh_token }),
    });
    if (!res.ok) throw new Error("Token refresh failed");
    const data = (await res.json()) as { access_token: string; refresh_token: string };
    return data;
  }
}
