import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const connectDB = vi.fn().mockResolvedValue(undefined);

/** One fake mongoose model per collection, with the chains the route uses. */
function makeModel() {
  return {
    create: vi.fn().mockResolvedValue({ _id: { toString: () => "new-id" } }),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn().mockResolvedValue({}),
    find: vi.fn(),
  };
}

const models: Record<string, ReturnType<typeof makeModel>> = {};
function model(name: string) {
  models[name] ||= makeModel();
  return models[name];
}

vi.mock("@/lib/mongodb", () => ({ connectDB: (...a: unknown[]) => connectDB(...a) }));
vi.mock("@/models", () => ({ getModel: (name: string) => model(name) }));

import { POST } from "@/app/api/db/route";
import { AUTH_COOKIE } from "@/lib/auth-cookie";
import { signToken } from "@/lib/auth";

const STAFF_UID = "507f1f77bcf86cd799439011";
const OTHER_UID = "507f1f77bcf86cd799439022";

/** Mirrors findById(...).select(...).lean() */
function selectLean(value: unknown) {
  return { select: () => ({ lean: () => Promise.resolve(value) }) };
}

/** Mirrors find(...).sort(...).limit(...).lean() */
function findChain(docs: unknown[]) {
  const chain = {
    sort: () => chain,
    limit: () => chain,
    lean: () => Promise.resolve(docs),
  };
  return chain;
}

function request(body: Record<string, unknown>, role = "staff", uid = STAFF_UID): NextRequest {
  const req = new NextRequest("https://app.test/api/db", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  req.cookies.set(AUTH_COOKIE, signToken({ uid, email: "s@d4.in", role, name: "Staff One" }));
  return req;
}

/** The caller's own staff document, as the route re-reads it for live grants. */
function callerIs(role: string, grantedFeatures: string[] = []) {
  models.staff.findById.mockReturnValue(selectLean({ role, grantedFeatures, isDeleted: false }));
}

function storedLog(log: Record<string, unknown> | null) {
  models.work_logs.findById.mockReturnValue(selectLean(log));
}

const logPayload = (over: Record<string, unknown> = {}) => ({
  staffId: STAFF_UID,
  staffName: "Staff One",
  departmentId: "d1",
  date: "2026-09-02",
  entries: [{ project: "ieci", activityType: "development", description: "shoot", hours: 7 }],
  totalHours: 7,
  status: "submitted",
  ...over,
});

beforeEach(() => {
  for (const key of Object.keys(models)) delete models[key];
  model("staff");
  model("work_logs");
  model("audit_logs");
  connectDB.mockReset().mockResolvedValue(undefined);
});

describe("/api/db work_logs — staff own the self-service daily log", () => {
  it("lets a zero-grant staff member submit their own log", async () => {
    callerIs("staff");
    const res = await POST(
      request({ action: "create", collection: "work_logs", data: logPayload() })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "new-id" });
    expect(models.work_logs.create).toHaveBeenCalled();
  });

  it("refuses a log filed under somebody else's staff id", async () => {
    callerIs("staff");
    const res = await POST(
      request({ action: "create", collection: "work_logs", data: logPayload({ staffId: OTHER_UID }) })
    );
    expect(res.status).toBe(403);
    expect(models.work_logs.create).not.toHaveBeenCalled();
  });

  it("lets the owner edit their own draft", async () => {
    callerIs("staff");
    storedLog({ staffId: STAFF_UID, status: "draft" });
    const res = await POST(
      request({ action: "update", collection: "work_logs", id: "w1", data: logPayload() })
    );
    expect(res.status).toBe(200);
    expect(models.work_logs.findByIdAndUpdate).toHaveBeenCalled();
  });

  it("refuses an edit to somebody else's log", async () => {
    callerIs("staff");
    storedLog({ staffId: OTHER_UID, status: "draft" });
    const res = await POST(
      request({ action: "update", collection: "work_logs", id: "w1", data: logPayload() })
    );
    expect(res.status).toBe(403);
    expect(models.work_logs.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("refuses an edit to the owner's already-submitted log", async () => {
    callerIs("staff");
    storedLog({ staffId: STAFF_UID, status: "submitted" });
    const res = await POST(
      request({ action: "update", collection: "work_logs", id: "w1", data: logPayload() })
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/no longer be edited/i);
  });

  it("refuses the owner marking their own log reviewed", async () => {
    callerIs("staff");
    storedLog({ staffId: STAFF_UID, status: "draft" });
    const res = await POST(
      request({
        action: "update",
        collection: "work_logs",
        id: "w1",
        data: { status: "reviewed", reviewedBy: STAFF_UID },
      })
    );
    expect(res.status).toBe(403);
    expect(models.work_logs.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("lets a reviewer act on any log", async () => {
    callerIs("department-head");
    storedLog({ staffId: OTHER_UID, status: "submitted" });
    const res = await POST(
      request(
        {
          action: "update",
          collection: "work_logs",
          id: "w1",
          data: { status: "reviewed", reviewedBy: "head", reviewRemarks: "ok" },
        },
        "department-head"
      )
    );
    expect(res.status).toBe(200);
    expect(models.work_logs.findByIdAndUpdate).toHaveBeenCalled();
  });

  it("scopes a zero-grant staff member's reads to their own logs", async () => {
    callerIs("staff");
    models.work_logs.find.mockReturnValue(findChain([]));
    const res = await POST(request({ action: "find", collection: "work_logs", constraints: [] }));
    expect(res.status).toBe(200);
    expect(models.work_logs.find).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: STAFF_UID })
    );
  });

  it("does not scope reads for a staff member holding the review grant", async () => {
    callerIs("staff", ["work-logs"]);
    models.work_logs.find.mockReturnValue(findChain([]));
    await POST(request({ action: "find", collection: "work_logs", constraints: [] }));
    const filter = models.work_logs.find.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.staffId).toBeUndefined();
  });
});
