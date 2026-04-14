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

        const res = await fetch(`${API_BASE}/auth/login`, {
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
        };

        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.fullName ?? data.user.email,
          role: data.user.role,
          token: data.token,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: string }).role;
        token.apiToken = (user as { token: string }).token;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.apiToken = token.apiToken as string;
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
  }
}
