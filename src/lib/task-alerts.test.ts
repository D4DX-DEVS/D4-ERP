import { describe, it, expect } from "vitest";
import { isUpdatePendingTask } from "@/lib/task-alerts";

const ts = (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 });

// Fixed reference points (local time)
const evening = new Date(2026, 6, 15, 19, 0); // 15 Jul, 7 PM — past cutoff
const afternoon = new Date(2026, 6, 15, 15, 0); // 15 Jul, 3 PM — before cutoff
const yesterday = new Date(2026, 6, 14, 11, 0);
const thisMorning = new Date(2026, 6, 15, 9, 30);

describe("isUpdatePendingTask (6 PM no-update flag)", () => {
  it("flags an open task last touched yesterday, after 6 PM", () => {
    expect(isUpdatePendingTask({ status: "in-progress", updatedAt: ts(yesterday) }, evening)).toBe(true);
    expect(isUpdatePendingTask({ status: "todo", createdAt: ts(yesterday) }, evening)).toBe(true);
  });

  it("does not flag before 6 PM", () => {
    expect(isUpdatePendingTask({ status: "todo", updatedAt: ts(yesterday) }, afternoon)).toBe(false);
  });

  it("does not flag tasks touched today", () => {
    expect(isUpdatePendingTask({ status: "in-progress", updatedAt: ts(thisMorning) }, evening)).toBe(false);
    expect(isUpdatePendingTask({ status: "todo", createdAt: ts(thisMorning) }, evening)).toBe(false);
  });

  it("never flags done tasks", () => {
    expect(isUpdatePendingTask({ status: "done", updatedAt: ts(yesterday) }, evening)).toBe(false);
  });
});
