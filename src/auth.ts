import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";
import { decryptToken, encryptToken } from "@/lib/token-crypto";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: `openid email profile ${GMAIL_SCOPE}`,
          // Google only issues a refresh_token together with a consent screen,
          // so it arrives once on first sign-in and we persist it in the DB.
          // Re-logins skip consent; the reconnectGmail action forces it again
          // when the stored token has been revoked or expired.
          access_type: "offline",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.access_token = account.access_token;
        token.expires_at = account.expires_at;
        delete token.error;

        const email = profile?.email ?? token.email;
        if (email) {
          const dbUser = await db.user.upsert({
            where: { email },
            create: { email },
            update: {},
            select: { id: true, gmailToken: true },
          });
          token.userId = dbUser.id;

          if (account.refresh_token) {
            // Consent flow: Google issued a (new) refresh token — persist it
            // so future re-logins can restore it into a fresh JWT.
            token.refresh_token = account.refresh_token;
            await db.user.update({
              where: { id: dbUser.id },
              data: { gmailToken: encryptToken(account.refresh_token) },
            });
          } else {
            // Re-login: no refresh_token in the OAuth response — restore the
            // one saved at first consent.
            token.refresh_token = dbUser.gmailToken
              ? (decryptToken(dbUser.gmailToken) ?? undefined)
              : undefined;
          }
        }

        return token;
      }

      if (token.expires_at && Date.now() / 1000 < token.expires_at - 60) {
        return token;
      }

      if (!token.refresh_token) {
        token.error = "RefreshAccessTokenError";
        return token;
      }

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
          error?: string;
        } = await res.json();
        if (!res.ok) throw refreshed;

        token.access_token = refreshed.access_token;
        token.expires_at = Math.floor(Date.now() / 1000) + refreshed.expires_in;
        if (refreshed.refresh_token) {
          token.refresh_token = refreshed.refresh_token;
          if (token.userId) {
            await db.user.update({
              where: { id: token.userId },
              data: { gmailToken: encryptToken(refreshed.refresh_token) },
            });
          }
        }
        delete token.error;
        return token;
      } catch (err) {
        console.error("Failed to refresh Google access token", err);
        // invalid_grant means the refresh token is dead (revoked, or expired
        // under a Testing-status OAuth app). Drop it everywhere so we stop
        // retrying and the UI offers the reconnect flow instead.
        const isInvalidGrant =
          typeof err === "object" &&
          err !== null &&
          "error" in err &&
          err.error === "invalid_grant";
        if (isInvalidGrant) {
          delete token.refresh_token;
          if (token.userId) {
            await db.user.update({
              where: { id: token.userId },
              data: { gmailToken: null },
            });
          }
        }
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
