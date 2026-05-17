import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: `openid email profile ${GMAIL_SCOPE}`,
          access_type: "offline",
          // prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.access_token = account.access_token;
        token.refresh_token = account.refresh_token;
        token.expires_at = account.expires_at;

        const email = profile?.email ?? token.email;
        if (email) {
          const dbUser = await db.user.upsert({
            where: { email },
            create: { email },
            update: {},
            select: { id: true },
          });
          token.userId = dbUser.id;
        }

        return token;
      }

      if (token.expires_at && Date.now() / 1000 < token.expires_at - 60) {
        return token;
      }

      if (!token.refresh_token) return token;

      try {
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.AUTH_GOOGLE_ID!,
            client_secret: process.env.AUTH_GOOGLE_SECRET!,
            grant_type: "refresh_token",
            refresh_token: token.refresh_token,
          }),
        });
        const refreshed: {
          access_token: string;
          expires_in: number;
          refresh_token?: string;
        } = await res.json();
        if (!res.ok) throw refreshed;

        token.access_token = refreshed.access_token;
        token.expires_at = Math.floor(Date.now() / 1000) + refreshed.expires_in;
        if (refreshed.refresh_token)
          token.refresh_token = refreshed.refresh_token;
        delete token.error;
        return token;
      } catch (err) {
        console.error("Failed to refresh Google access token", err);
        token.error = "RefreshAccessTokenError";
        return token;
      }
    },
    async session({ session, token }) {
      session.error = token.error;
      session.access_token = token.access_token;
      if (token.userId) session.userId = token.userId;
      return session;
    },
  },
});
