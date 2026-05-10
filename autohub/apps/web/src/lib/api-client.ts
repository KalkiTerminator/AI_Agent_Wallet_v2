import { env } from "./env";
const API_BASE_URL = env.NEXT_PUBLIC_API_URL;

interface ApiOptions extends RequestInit {
  token?: string;
}

async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { token, ...fetchOptions } = options;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...fetchOptions.headers,
  };

  const res = await fetch(`${API_BASE_URL}${path}`, { ...fetchOptions, headers });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.error ?? error.message ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, token?: string) => apiRequest<T>(path, { method: "GET", token }),
  post: <T>(path: string, body: unknown, token?: string) =>
    apiRequest<T>(path, { method: "POST", body: JSON.stringify(body), token }),
  patch: <T>(path: string, body: unknown, token?: string) =>
    apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body), token }),
  delete: <T>(path: string, token?: string) => apiRequest<T>(path, { method: "DELETE", token }),
};

/**
 * Server-side helper — reads API token from the NextAuth session.
 * Only call this from Server Components or Route Handlers.
 */
export async function getServerApiToken(): Promise<string | undefined> {
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  return session?.apiToken;
}
