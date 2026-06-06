import { describe, it, expect, vi, beforeEach } from "vitest";

const createDocument = vi.fn();
vi.mock("@/lib/firestore", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firestore")>("@/lib/firestore");
  return {
    ...actual,
    createDocument: (...args: unknown[]) => createDocument(...args),
  };
});

import { logAudit } from "@/lib/audit";

beforeEach(() => createDocument.mockReset());

describe("audit log creation", () => {
  const actor = { uid: "u1", firstName: "Ada", lastName: "Admin" };

  it("writes an audit entry to the audit_logs collection", async () => {
    createDocument.mockResolvedValue({ id: "log1" });
    await logAudit("create", "invoices", "invoice", "inv-1", "Created invoice", actor);

    expect(createDocument).toHaveBeenCalledTimes(1);
    const [collection, entry] = createDocument.mock.calls[0];
    expect(collection).toBe("audit_logs");
    expect(entry).toMatchObject({
      userId: "u1",
      userName: "Ada Admin",
      action: "create",
      module: "invoices",
      entityType: "invoice",
      entityId: "inv-1",
      description: "Created invoice",
    });
    expect(entry.timestamp).toBeDefined();
  });

  it("records a System actor when no user is supplied", async () => {
    createDocument.mockResolvedValue({ id: "log2" });
    await logAudit("delete", "tasks", "task", "t-9", "Deleted task", null);

    const [, entry] = createDocument.mock.calls[0];
    expect(entry.userId).toBe("system");
    expect(entry.userName).toBe("System");
  });

  it("captures previous/new data snapshots when provided", async () => {
    createDocument.mockResolvedValue({ id: "log3" });
    await logAudit("update", "clients", "client", "c-1", "Updated client", actor, {
      previousData: { name: "Old" },
      newData: { name: "New" },
    });

    const [, entry] = createDocument.mock.calls[0];
    expect(entry.previousData).toEqual({ name: "Old" });
    expect(entry.newData).toEqual({ name: "New" });
  });
});
