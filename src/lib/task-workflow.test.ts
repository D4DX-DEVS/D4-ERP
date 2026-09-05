import { describe, it, expect } from "vitest";
import { canDeleteTask, type TaskOwnership } from "@/lib/task-workflow";

const mine = { createdBy: "u1", assignedBy: "u1", departmentId: "d1" };
const sameDept = { createdBy: "u2", assignedBy: "u2", departmentId: "d1" };
const otherDept = { createdBy: "u2", assignedBy: "u2", departmentId: "d9" };
const legacyNoDept = { createdBy: "u2", assignedBy: "u2" };

describe("canDeleteTask", () => {
  it("admin deletes anything", () => {
    expect(canDeleteTask("admin", "u1", null, otherDept)).toBe(true);
    expect(canDeleteTask("admin", "u1", null, legacyNoDept)).toBe(true);
  });

  it("department-head deletes own-department tasks and tasks they created", () => {
    expect(canDeleteTask("department-head", "u1", "d1", sameDept)).toBe(true);
    expect(canDeleteTask("department-head", "u1", "d1", { ...otherDept, createdBy: "u1" })).toBe(true);
    expect(canDeleteTask("department-head", "u1", "d1", otherDept)).toBe(false);
    expect(canDeleteTask("department-head", "u1", "d1", legacyNoDept)).toBe(false);
  });

  it("staff (including a Task Management grant) deletes only tasks they created", () => {
    expect(canDeleteTask("staff", "u1", null, mine)).toBe(true);
    expect(canDeleteTask("staff", "u1", null, { assignedBy: "u1", departmentId: "d1" })).toBe(true);
    expect(canDeleteTask("staff", "u1", "d1", sameDept)).toBe(false);
    // Being the assignee is deliberately not enough; the field is ignored.
    const assigneeOnly = { ...sameDept, assigneeId: "u1" } as TaskOwnership;
    expect(canDeleteTask("staff", "u1", null, assigneeOnly)).toBe(false);
  });

  it("accounts follows the staff rule", () => {
    expect(canDeleteTask("accounts", "u1", null, mine)).toBe(true);
    expect(canDeleteTask("accounts", "u1", null, sameDept)).toBe(false);
  });
});
