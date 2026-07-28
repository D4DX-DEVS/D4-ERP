import { describe, it, expect } from "vitest";
import { deptScopeFor, inDeptScope } from "./dept-scope";

describe("dept-scope", () => {
  it("leaves admins unscoped", () => {
    const scope = deptScopeFor("admin", undefined);
    expect(scope).toBeNull();
    expect(inDeptScope(scope, "dept-a")).toBe(true);
    expect(inDeptScope(scope, undefined)).toBe(true);
  });

  it("limits a department head to their own department", () => {
    const scope = deptScopeFor("department-head", "dept-a");
    expect(inDeptScope(scope, "dept-a")).toBe(true);
    expect(inDeptScope(scope, "dept-b")).toBe(false);
    expect(inDeptScope(scope, undefined)).toBe(false);
  });

  it("fails closed for a department head with no department", () => {
    const scope = deptScopeFor("department-head", undefined);
    expect(scope).toBe("");
    expect(inDeptScope(scope, "dept-a")).toBe(false);
    expect(inDeptScope(scope, undefined)).toBe(false);
  });
});
