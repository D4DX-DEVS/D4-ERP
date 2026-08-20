import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDocuments, updateDocument, setAuditUser, clearCache } from "./firestore";

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
