import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mock the db module before importing route
// ---------------------------------------------------------------------------
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../db/index.js", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed_password"),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn().mockReturnValue("mock.jwt.token"),
    verify: vi.fn().mockReturnValue({ userId: "user-1", email: "user@example.com", role: "user" }),
  },
}));

vi.mock("../services/email.js", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

// Import AFTER mocks are set up
const { authRouter } = await import("./auth.js");

// Build a standalone Hono app for testing
const app = new Hono();
app.route("/api/auth", authRouter);

// Helper: make a JSON request to the test app
async function req(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Helpers to configure mock chains
// ---------------------------------------------------------------------------
function chainSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockSelect.mockReturnValue(chain);
  return chain;
}

function chainInsert(returning: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returning),
  };
  mockInsert.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "test-secret";
  // Default: all inserts (e.g. audit logs, sessions) resolve to empty array
  mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue([]) });
});

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
describe("POST /api/auth/register", () => {
  it("returns 201 with token when email is new", async () => {
    // First select (check existing) returns empty
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(selectChain);

    // First insert (users) chains .returning(); others (userRoles, credits, auditLogs, sessions, emailVerificationTokens)
    // resolve on .values() — handled by the beforeEach default; override only the first call
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "user-1", email: "user@example.com", fullName: "Alice" }]),
      }),
    });

    const res = await req("POST", "/api/auth/register", {
      email: "user@example.com",
      password: "Str0ng!Password",
      fullName: "Alice",
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.token).toBe("mock.jwt.token");
    expect(json.user.email).toBe("user@example.com");
  });

  it("returns 409 when email already exists", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "existing-user", email: "user@example.com" }]),
    };
    mockSelect.mockReturnValue(selectChain);

    const res = await req("POST", "/api/auth/register", {
      email: "user@example.com",
      password: "Str0ng!Password",
    });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("Email already registered");
  });

  it("returns 400 for invalid email", async () => {
    const res = await req("POST", "/api/auth/register", {
      email: "not-an-email",
      password: "Str0ng!Password",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for short password", async () => {
    const res = await req("POST", "/api/auth/register", {
      email: "user@example.com",
      password: "short",
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
describe("POST /api/auth/login", () => {
  it("returns 200 with token on valid credentials", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        // first call: find user
        .mockResolvedValueOnce([{ id: "user-1", email: "user@example.com", passwordHash: "hashed", fullName: "Alice" }])
        // second call: find role
        .mockResolvedValueOnce([{ userId: "user-1", role: "user" }]),
    };
    mockSelect.mockReturnValue(selectChain);

    const res = await req("POST", "/api/auth/login", {
      email: "user@example.com",
      password: "password123",
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBe("mock.jwt.token");
    expect(json.user.role).toBe("user");
  });

  it("returns 401 when user not found", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(selectChain);

    const res = await req("POST", "/api/auth/login", {
      email: "ghost@example.com",
      password: "password123",
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Invalid credentials");
  });

  it("returns 401 when password is wrong", async () => {
    const { default: bcrypt } = await import("bcryptjs");
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "user-1", email: "user@example.com", passwordHash: "hashed" }]),
    };
    mockSelect.mockReturnValue(selectChain);

    const res = await req("POST", "/api/auth/login", {
      email: "user@example.com",
      password: "wrongpass",
    });

    expect(res.status).toBe(401);
  });
});
