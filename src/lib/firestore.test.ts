import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getDocuments,
  updateDocument,
  setAuditUser,
  clearCache,
  setUnauthorizedHandler,
  clearUnauthorizedHandler,
} from "./firestore";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function ok(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
}

beforeEach(() => {
  fetchMock.mockReset();
  clearCache();
  setAuditUser(null);
});

describe("read cache", () => {
  it("serves a repeat query from cache", async () => {
    fetchMock.mockReturnValue(ok([{ id: "1" }]));
    await getDocuments("staff");
    await getDocuments("staff");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent identical queries", async () => {
    fetchMock.mockReturnValue(ok([{ id: "1" }]));
    await Promise.all([getDocuments("tasks"), getDocuments("tasks"), getDocuments("tasks")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not share a cache entry across different constraints", async () => {
    fetchMock.mockReturnValue(ok([]));
    await getDocuments("staff");
    await getDocuments("staff", [{ _type: "where", field: "isActive", op: "==", value: true }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalidates the collection after a write", async () => {
    fetchMock.mockReturnValue(ok([{ id: "1" }]));
    await getDocuments("staff");
    await updateDocument("staff", "1", { firstName: "X" });
    await getDocuments("staff");
    expect(fetchMock).toHaveBeenCalledTimes(3); // read, write, re-read
  });

  it("leaves other collections cached after an unrelated write", async () => {
    fetchMock.mockReturnValue(ok([]));
    await getDocuments("staff");
    await updateDocument("tasks", "1", { status: "done" });
    await getDocuments("staff");
    expect(fetchMock).toHaveBeenCalledTimes(2); // read, write
  });

  it("drops the cache when the signed-in user changes", async () => {
    fetchMock.mockReturnValue(ok([]));
    setAuditUser({ uid: "a", firstName: "A", lastName: "A" });
    await getDocuments("staff");
    setAuditUser({ uid: "b", firstName: "B", lastName: "B" });
    await getDocuments("staff");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("hands back a copy so callers cannot corrupt the cache", async () => {
    fetchMock.mockReturnValue(ok([{ id: "1" }, { id: "2" }]));
    const first = await getDocuments("staff");
    first.length = 0;
    expect(await getDocuments("staff")).toHaveLength(2);
  });

  it("does not cache a failed read", async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve({ ok: false, json: () => Promise.resolve({ error: "boom" }) } as Response));
    await expect(getDocuments("staff")).rejects.toThrow("boom");
    fetchMock.mockReturnValue(ok([]));
    await getDocuments("staff");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("expired session", () => {
  function fails(status: number, error: string) {
    return Promise.resolve({ ok: false, status, json: () => Promise.resolve({ error }) } as Response);
  }

  it("reports a dead session to the registered handler", async () => {
    // Without this the caller only sees a generic "Unauthorized" error toast and
    // stays parked on a dashboard it can no longer load — the client has to log
    // out by hand. The handler is what turns that into a redirect to /login.
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockReturnValue(fails(401, "Unauthorized"));
    await expect(getDocuments("staff")).rejects.toThrow(/session expired/i);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    setUnauthorizedHandler(null);
  });

  it("leaves a 403 alone — a permission denial is not a dead session", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockReturnValue(fails(403, "Not allowed for your role"));
    await expect(getDocuments("staff")).rejects.toThrow("Not allowed for your role");
    expect(onUnauthorized).not.toHaveBeenCalled();
    setUnauthorizedHandler(null);
  });

  it("reports a dead session on writes too", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockReturnValue(fails(401, "Unauthorized"));
    await expect(updateDocument("tasks", "1", { status: "done" })).rejects.toThrow(/session expired/i);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    setUnauthorizedHandler(null);
  });

  it("survives having no handler registered", async () => {
    setUnauthorizedHandler(null);
    fetchMock.mockReturnValue(fails(401, "Unauthorized"));
    await expect(getDocuments("staff")).rejects.toThrow(/session expired/i);
  });
});

describe("unauthorized handler registration", () => {
  function fails401() {
    return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: "Unauthorized" }) } as Response);
  }

  it("keeps the newest handler when an outgoing layout cleans up after a new one registered", async () => {
    // Dashboard and staff portal both mount the auth hook. On a route change
    // React can mount the new layout before the old one's cleanup runs, and an
    // unconditional clear would leave nothing listening for a dead session.
    const outgoing = vi.fn();
    const incoming = vi.fn();
    setUnauthorizedHandler(outgoing);
    setUnauthorizedHandler(incoming);
    clearUnauthorizedHandler(outgoing);

    fetchMock.mockReturnValue(fails401());
    await expect(getDocuments("staff")).rejects.toThrow(/session expired/i);
    expect(incoming).toHaveBeenCalledTimes(1);
    expect(outgoing).not.toHaveBeenCalled();
    setUnauthorizedHandler(null);
  });

  it("still unregisters the live handler", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    clearUnauthorizedHandler(handler);

    fetchMock.mockReturnValue(fails401());
    await expect(getDocuments("staff")).rejects.toThrow(/session expired/i);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("concurrent failures on a dead session", () => {
  it("logs out once even when a page fires many reads at the same moment", async () => {
    // A dashboard route kicks off a dozen parallel queries; one dead session
    // should not mean a dozen logout requests.
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockReturnValue(
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: "Unauthorized" }) } as Response)
    );

    const reads = ["staff", "tasks", "clients", "invoices"].map((c) =>
      getDocuments(c).catch(() => null)
    );
    await Promise.all(reads);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    setUnauthorizedHandler(null);
  });

  it("arms again after the session comes back", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    fetchMock.mockReturnValue(
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: "Unauthorized" }) } as Response)
    );
    await getDocuments("staff").catch(() => null);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    // A fresh login succeeds...
    fetchMock.mockReturnValue(Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response));
    await getDocuments("tasks");

    // ...and the next expiry is reported again.
    fetchMock.mockReturnValue(
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: "Unauthorized" }) } as Response)
    );
    await getDocuments("clients").catch(() => null);
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
    setUnauthorizedHandler(null);
  });
});
