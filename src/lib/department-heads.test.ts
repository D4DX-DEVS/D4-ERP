import { describe, it, expect } from "vitest";
import { departmentHeadIds, departmentHeadStatus, type HeadStaff } from "@/lib/department-heads";

const staff: HeadStaff[] = [
  { id: "rashid", role: "department-head", departmentId: "events", isActive: true },
  { id: "shameel", role: "staff", departmentId: "events", isActive: true },
  { id: "old-head", role: "department-head", departmentId: "events", isActive: false },
  { id: "gone-head", role: "department-head", departmentId: "events", isActive: true, isDeleted: true },
  { id: "shahid", role: "staff", departmentId: "admin-dept", isActive: true },
  { id: "farooque", role: "department-head", departmentId: "productions", isActive: true },
];

describe("departmentHeadIds (who can decide the department step)", () => {
  it("is every active department head of that department", () => {
    expect(departmentHeadIds(staff, "events")).toEqual(["rashid"]);
  });

  it("is empty when no one holds the role there", () => {
    expect(departmentHeadIds(staff, "admin-dept")).toEqual([]);
    expect(departmentHeadIds(staff, "")).toEqual([]);
  });
});

describe("departmentHeadStatus (what the Departments page warns about)", () => {
  it("is fine when the named head holds the role in that department", () => {
    expect(departmentHeadStatus({ id: "productions", headId: "farooque" }, staff)).toEqual({
      approverIds: ["farooque"],
      issue: null,
    });
  });

  it("flags a named head whose role cannot approve", () => {
    expect(departmentHeadStatus({ id: "admin-dept", headId: "shahid" }, staff).issue).toBe("head-not-approver");
  });

  it("flags a named head who belongs to another department", () => {
    expect(departmentHeadStatus({ id: "events", headId: "farooque" }, staff).issue).toBe("head-other-department");
  });

  it("flags a department with approvers but no named head", () => {
    expect(departmentHeadStatus({ id: "events", headId: null }, staff)).toEqual({
      approverIds: ["rashid"],
      issue: "head-not-set",
    });
  });

  it("flags a department where no one can approve the department step", () => {
    expect(departmentHeadStatus({ id: "kids", headId: null }, staff).issue).toBe("no-approver");
  });
});
