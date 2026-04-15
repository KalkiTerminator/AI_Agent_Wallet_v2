import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import jwt from "jsonwebtoken";

// ---------------------------------------------------------------------------
// Mock db
// ---------------------------------------------------------------------------
vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

// Mock ToolExecutionService
vi.mock("../services/tool-execution.js", () => ({
  ToolExecutionService: {
    execute: vi.fn(),
  },
}));

// Mock rate-limit to be a passthrough
vi.mock("../middleware/rate-limit.js", () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => await next(),
}));

const { toolsRouter } = await import("./tools.js");
const { db } = await import("../db/index.js");
const { ToolExecutionService } = await import("../services/tool-execution.js");

// Build test app
const app = new Hono();
app.route("/api/tools", toolsRouter);

process.env.NEXTAUTH_SECRET = "test-secret";

// Create a signed JWT for authenticated requests
function makeToken(role: "user" | "admin" = "user") {
  return jwt.sign({ userId: "user-1", email: "user@example.com", role }, "test-secret");
}

function authHeader(role: "user" | "admin" = "user") {
  return { Authorization: `Bearer ${makeToken(role)}` };
}

async function req(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Typed mock helpers
const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function setupSelectReturns(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(rows),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /api/tools
// ---------------------------------------------------------------------------
describe("GET /api/tools", () => {
  it("returns list of approved active tools", async () => {
    const tools = [
      { id: "tool-1", name: "GPT Summariser", isActive: true, approvalStatus: "approved" },
    ];

    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(tools),
    };
    mockDb.select.mockReturnValue(chain);

    const res = await req("GET", "/api/tools");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].name).toBe("GPT Summariser");
  });
});

// ---------------------------------------------------------------------------
// GET /api/tools/mine
// ---------------------------------------------------------------------------
describe("GET /api/tools/mine", () => {
  it("requires auth", async () => {
    const res = await req("GET", "/api/tools/mine");
    expect(res.status).toBe(401);
  });

  it("returns tools created by current user", async () => {
    const tools = [{ id: "tool-2", name: "My Tool", createdByUserId: "user-1" }];
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(tools),
    };
    mockDb.select.mockReturnValue(chain);

    const res = await req("GET", "/api/tools/mine", undefined, authHeader());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data[0].name).toBe("My Tool");
  });
});

// ---------------------------------------------------------------------------
// GET /api/tools/:id
// ---------------------------------------------------------------------------
describe("GET /api/tools/:id", () => {
  it("returns 404 for unknown tool", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockDb.select.mockReturnValue(chain);

    const res = await req("GET", "/api/tools/nonexistent-id");
    expect(res.status).toBe(404);
  });

  it("returns tool when found", async () => {
    const tool = { id: "tool-1", name: "GPT Summariser" };
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([tool]),
    };
    mockDb.select.mockReturnValue(chain);

    const res = await req("GET", "/api/tools/tool-1");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe("tool-1");
  });
});

// ---------------------------------------------------------------------------
// POST /api/tools (submit new tool)
// ---------------------------------------------------------------------------
describe("POST /api/tools", () => {
  it("requires auth", async () => {
    const res = await req("POST", "/api/tools", { name: "X", description: "D", category: "Dev" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    const res = await req(
      "POST",
      "/api/tools",
      { description: "D", category: "Dev" },
      authHeader()
    );
    expect(res.status).toBe(400);
  });

  it("creates tool with pending approval status", async () => {
    const newTool = { id: "tool-new", name: "My Tool", approvalStatus: "pending" };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([newTool]),
    };
    mockDb.insert.mockReturnValue(insertChain);

    const res = await req(
      "POST",
      "/api/tools",
      { name: "My Tool", description: "Does stuff", category: "Development" },
      authHeader()
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.approvalStatus).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// POST /api/tools/:id/execute
// ---------------------------------------------------------------------------
describe("POST /api/tools/:id/execute", () => {
  it("requires auth", async () => {
    const res = await req("POST", "/api/tools/tool-1/execute", { inputs: {} });
    expect(res.status).toBe(401);
  });

  it("calls ToolExecutionService and returns result", async () => {
    vi.mocked(ToolExecutionService.execute).mockResolvedValue({
      usageId: "usage-1",
      status: "success",
      creditsDeducted: 5,
    });

    const res = await req(
      "POST",
      "/api/tools/tool-1/execute",
      { inputs: { prompt: "hello" } },
      authHeader()
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("success");
    expect(json.data.creditsDeducted).toBe(5);
    expect(ToolExecutionService.execute).toHaveBeenCalledWith({
      toolId: "tool-1",
      userId: "user-1",
      inputs: { prompt: "hello" },
      ip: undefined,
    });
  });
});
