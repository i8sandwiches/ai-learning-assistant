import NextAuth from "next-auth";
import type { DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import type { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      provider?: string;
      providerAccountId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    provider?: string;
    providerAccountId?: string;
  }
}

const Naver = {
  id: "naver",
  name: "Naver",
  type: "oauth" as const,
  authorization: {
    url: "https://nid.naver.com/oauth2.0/authorize",
    params: { response_type: "code", scope: "name email profile_image" }
  },
  token: "https://nid.naver.com/oauth2.0/token",
  userinfo: "https://openapi.naver.com/v1/nid/me",
  clientId: process.env.AUTH_NAVER_ID,
  clientSecret: process.env.AUTH_NAVER_SECRET,
  profile(profile: { response: { id: string; email?: string; name?: string; nickname?: string; profile_image?: string } }) {
    const r = profile.response;
    return {
      id: r.id,
      name: r.nickname || r.name || "",
      email: r.email || "",
      image: r.profile_image || ""
    };
  }
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
    Kakao({
      authorization: {
        url: "https://kauth.kakao.com/oauth/authorize",
        params: {
          scope: "profile_nickname"
        }
      }
    }),
    Naver
  ],
  trustHost: true,
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        return Boolean(profile?.email);
      }
      if (account?.provider === "naver") {
        // Naver wraps user info under `response`
        const r = (profile as { response?: { id?: string } } | undefined)?.response;
        return Boolean(r?.id);
      }
      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        token.provider = account.provider;
        token.providerAccountId = account.providerAccountId;
      }

      return token as JWT;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.provider = token.provider;
        session.user.providerAccountId = token.providerAccountId;
      }

      return session;
    }
  }
});
