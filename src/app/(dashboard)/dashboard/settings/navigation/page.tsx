"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAllNavItems, type FlatNavItem } from "@/lib/navigation";
import { useAuthStore } from "@/store/auth-store";
import { useNavConfigStore } from "@/store/nav-config-store";
import { getDocuments, updateDocument, createDocument, where, Timestamp } from "@/lib/firestore";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { Staff, NavigationConfig, StaffRole } from "@/types";
import { Check, X, Save } from "lucide-react";

const ROLES: StaffRole[] = ["department-head", "accounts", "staff"];

interface ModuleGroup {
  moduleId: string;
  moduleLabel: string;
  items: FlatNavItem[];
}

export default function NavigationSettingsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { config, fetchConfig } = useNavConfigStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<(Staff & { id: string })[]>([]);
  const [localConfig, setLocalConfig] = useState<NavigationConfig | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [allItems] = useState<FlatNavItem[]>(getAllNavItems());

  // Group items by module
  const moduleGroups = (() => {
    const groups: Record<string, ModuleGroup> = {};
    for (const item of allItems) {
      if (!groups[item.moduleId]) {
        groups[item.moduleId] = {
          moduleId: item.moduleId,
          moduleLabel: item.moduleLabel,
          items: [],
        };
      }
      groups[item.moduleId].items.push(item);
    }
    return Object.values(groups);
  })();

  useEffect(() => {
    const checkAccess = async () => {
      if (user?.role !== "admin") {
        router.push("/dashboard");
        return;
      }

      try {
        await fetchConfig();
        const staffDocs = await getDocuments<Staff>("staff", [where("isActive", "==", true)]);
        setStaff(staffDocs);
        setLocalConfig(config || { roleMenus: {}, staffOverrides: {} });
      } catch (error) {
        toast("error", "Failed to load configuration");
      } finally {
        setLoading(false);
      }
    };
    checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router]);

  const toggleRoleMenuItem = (role: StaffRole, href: string) => {
    if (!localConfig) return;
    const roleMenus = { ...localConfig.roleMenus };
    const current = roleMenus[role] ?? [];

    if (current.includes(href)) {
      roleMenus[role] = current.filter((h) => h !== href);
    } else {
      roleMenus[role] = [...current, href];
    }

    setLocalConfig({ ...localConfig, roleMenus });
  };

  const toggleStaffOverride = (staffId: string, href: string, type: "allow" | "deny") => {
    if (!localConfig) return;
    const overrides = { ...localConfig.staffOverrides };
    if (!overrides[staffId]) {
      overrides[staffId] = {};
    }

    const override = { ...overrides[staffId] };
    const list = override[type] ?? [];

    if (list.includes(href)) {
      override[type] = list.filter((h) => h !== href);
      if (list.length === 1) delete override[type];
    } else {
      // Remove from opposite list if present
      const opposite = type === "allow" ? "deny" : "allow";
      override[opposite] = (override[opposite] ?? []).filter((h) => h !== href);
      if (override[opposite]?.length === 0) delete override[opposite];

      override[type] = [...list, href];
    }

    if (Object.keys(override).length === 0) {
      delete overrides[staffId];
    } else {
      overrides[staffId] = override;
    }

    setLocalConfig({ ...localConfig, staffOverrides: overrides });
  };

  const handleSave = async () => {
    if (!localConfig) return;
    setSaving(true);
    try {
      const docs = await getDocuments<NavigationConfig>("settings", [
        where("key", "==", "navigationConfig"),
      ]);

      if (docs.length > 0) {
        await updateDocument("settings", docs[0].id, {
          ...localConfig,
          updatedAt: Timestamp.now(),
        });
      } else {
        await createDocument("settings", {
          key: "navigationConfig",
          ...localConfig,
          createdAt: Timestamp.now(),
        });
      }

      await fetchConfig();
      toast("success", "Navigation configuration saved");
    } catch (error) {
      toast("error", "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!localConfig) {
    return <div className="text-center py-8 text-slate-600">Failed to load configuration</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header with save button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Navigation Configuration</h1>
          <p className="text-sm text-slate-600 mt-1">Configure menu visibility by role and staff member</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Configuration"}
        </Button>
      </div>

      {/* Admin note */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        Admin role always has full access to all navigation items. This configuration applies to department-head, accounts, and staff roles only.
      </div>

      {/* Role-based matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Role Menu Visibility</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Check to allow, uncheck to hide. Missing a role entry defaults to current code role list.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 font-semibold">Item</th>
                  {ROLES.map((role) => (
                    <th key={role} className="text-center py-2 px-2 font-semibold">
                      {role.replace("-", " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {moduleGroups.map((group) => (
                  <tbody key={group.moduleId}>
                    {/* Module header */}
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <td colSpan={ROLES.length + 1} className="py-2 px-3 font-semibold text-slate-900">
                        {group.moduleLabel}
                      </td>
                    </tr>

                    {/* Module items */}
                    {group.items.map((item) => (
                      <tr key={item.href} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-3 text-slate-700">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-slate-900">{item.label}</div>
                              {item.subGroup && (
                                <div className="text-xs text-slate-500 mt-0.5">{item.subGroup}</div>
                              )}
                              <div className="text-xs text-slate-400 font-mono mt-1">{item.href}</div>
                            </div>
                          </div>
                        </td>

                        {ROLES.map((role) => {
                          const isChecked = (localConfig.roleMenus?.[role] ?? []).includes(item.href);
                          return (
                            <td key={role} className="text-center py-3 px-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleRoleMenuItem(role, item.href)}
                                className="w-4 h-4 cursor-pointer rounded"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Staff overrides */}
      <Card>
        <CardHeader>
          <CardTitle>Per-Staff Overrides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="staff-picker">Select staff member</Label>
            <SelectRoot value={selectedStaffId} onValueChange={setSelectedStaffId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a staff member..." />
              </SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} ({s.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </div>

          {selectedStaffId && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Allow: Grants access. Deny: Revokes access. Inherit: Uses role default.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-semibold">Item</th>
                      <th className="text-center py-2 px-3 font-semibold">Inherit</th>
                      <th className="text-center py-2 px-3 font-semibold">Allow</th>
                      <th className="text-center py-2 px-3 font-semibold">Deny</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allItems.map((item) => {
                      const staffOverride = localConfig.staffOverrides?.[selectedStaffId];
                      const state = staffOverride?.deny?.includes(item.href)
                        ? "deny"
                        : staffOverride?.allow?.includes(item.href)
                          ? "allow"
                          : "inherit";

                      return (
                        <tr key={item.href} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 px-3 text-slate-700">
                            <div className="font-medium text-slate-900 text-sm">{item.label}</div>
                            {item.subGroup && (
                              <div className="text-xs text-slate-500">{item.subGroup}</div>
                            )}
                          </td>

                          {(["inherit", "allow", "deny"] as const).map((s) => (
                            <td key={s} className="text-center py-2 px-3">
                              <input
                                type="radio"
                                name={`${selectedStaffId}-${item.href}`}
                                checked={state === s}
                                onChange={() => {
                                  if (s === "allow") toggleStaffOverride(selectedStaffId, item.href, "allow");
                                  else if (s === "deny") toggleStaffOverride(selectedStaffId, item.href, "deny");
                                  else {
                                    // Clear both allow and deny
                                    const override = localConfig.staffOverrides?.[selectedStaffId];
                                    if (override) {
                                      const newOverride = { ...override };
                                      delete newOverride.allow;
                                      delete newOverride.deny;
                                      if (Object.keys(newOverride).length === 0) {
                                        const overrides = { ...localConfig.staffOverrides };
                                        delete overrides[selectedStaffId];
                                        setLocalConfig({ ...localConfig, staffOverrides: overrides });
                                      } else {
                                        const overrides = { ...localConfig.staffOverrides, [selectedStaffId]: newOverride };
                                        setLocalConfig({ ...localConfig, staffOverrides: overrides });
                                      }
                                    }
                                  }
                                }}
                                className="w-4 h-4 cursor-pointer"
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
