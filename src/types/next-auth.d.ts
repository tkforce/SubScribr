import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    error?: "RefreshAccessTokenError";
    access_token?: string;
    user: DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    error?: "RefreshAccessTokenError";
  }
}

export {};
