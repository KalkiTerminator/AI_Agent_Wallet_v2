import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!res.ok) return null;

          const data = await res.json() as {
            token: string;
            user: { id: string; email: string; fullName: string | null; role: string };
            emailVerifiedAt?: string | null;
            mfaRequired?: boolean;
            mfaToken?: string;
          };

          if (!(data as any).mfaRequired && (!data?.token || !data?.user?.id)) return null;

          // MFA step-up: don't issue full session yet
          if ((data as any).mfaRequired) {
            return {
              id: data.user.id,
              email: data.user.email,
              name: data.user.fullName ?? data.user.email,
              role: data.user.role,
              token: "",
              mfaPending: true,
              mfaToken: (data as any).mfaToken,
            };
          }

          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.fullName ?? data.user.email,
            role: data.user.role,
            token: data.token,
            emailVerified: !!(data as any).emailVerifiedAt,
          };
        } catch {
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as any).role;
        token.apiToken = (user as any).token;
        token.mfaPending = (user as any).mfaPending ?? false;
        token.mfaToken = (user as any).mfaToken ?? null;
        token.emailVerified = (user as any).emailVerified ?? false;
        token.mfaEnabled = (user as any).mfaEnabled ?? false;
      }
      // Handle session.update() calls from MFA challenge completion
      if (trigger === "update" && session?.apiToken) {
        token.apiToken = session.apiToken;
        token.mfaPending = session.mfaPending ?? false;
        token.mfaToken = session.mfaToken ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.apiToken = token.apiToken as string;
      session.mfaPending = token.mfaPending as boolean;
      session.mfaToken = token.mfaToken as string | null;
      session.emailVerified = token.emailVerified as boolean;
      session.mfaEnabled = token.mfaEnabled as boolean;
      return session;
    },
  },

  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },

  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
});

// Extend NextAuth types
declare module "next-auth" {
  interface Session {
    apiToken: string;
    mfaPending: boolean;
    mfaToken: string | null;
    emailVerified: boolean;
    mfaEnabled: boolean;
    user: {
      id: string;
      role: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: string;
    apiToken: string;
    mfaPending: boolean;
    mfaToken: string | null;
    emailVerified: boolean;
    mfaEnabled: boolean;
  }
}
