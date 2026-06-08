"use client";

import { useEffect, useState } from "react";
import { getDocuments, createDocument, updateDocument, Timestamp, where } from "@/lib/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Label } from "@/components/ui/label";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Building, Save, Globe, Clock, IndianRupee, CalendarOff, Plus, Trash2, MapPin, FileText } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { Company } from "@/types";
import {
  AppSettings,
  WeekdayKey,
  WEEKDAYS_UI,
  cloneWeeklySchedule,
  normalizeSettings,
} from "@/lib/settings";

const SETTINGS_TABS = [
  { id: "general", label: "General", icon: Building },
  { id: "tax", label: "Tax & Invoice", icon: IndianRupee },
  { id: "numbering", label: "Document Numbers", icon: FileText },
  { id: "schedule", label: "Work Schedule", icon: Clock },
  { id: "attendance", label: "Attendance", icon: MapPin },
  { id: "holidays", label: "Holidays", icon: CalendarOff },
  { id: "leave", label: "Leave Policy", icon: Clock },
  { id: "integrations", label: "Integrations", icon: Globe },
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(() => normalizeSettings(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ date: "", name: "", companyId: "" });
  const [companies, setCompanies] = useState<(Company & { id: string })[]>([]);
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");
  const { toast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await getDocuments<AppSettings>("settings");
        if (data.length > 0) {
          setSettings(normalizeSettings({ ...data[0], id: data[0].id }));
        }
      } catch (error) {
        console.error("Error:", error);
        toast("error", "Failed to load settings");
      } finally {
        setLoading(false);
      }
    };
    fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getDocuments<Company>("companies", [where("isActive", "==", true)])
      .then(setCompanies)
      .catch((error) => console.error("Error:", error));
  }, []);

  const updateDay = (key: WeekdayKey, patch: Partial<AppSettings["weeklySchedule"][WeekdayKey]>) => {
    setSettings((prev) => ({
      ...prev,
      weeklySchedule: {
        ...prev.weeklySchedule,
        [key]: { ...prev.weeklySchedule[key], ...patch },
      },
    }));
  };

  const applyDefaultToAll = () => {
    setSettings((prev) => {
      const schedule = cloneWeeklySchedule(prev.weeklySchedule);
      (Object.keys(schedule) as WeekdayKey[]).forEach((key) => {
        if (schedule[key].enabled) {
          schedule[key] = {
            ...schedule[key],
            start: prev.workingHours.start,
            end: prev.workingHours.end,
          };
        }
      });
      return { ...prev, weeklySchedule: schedule };
    });
    toast("success", "Default times applied to all working days");
  };

  const addHoliday = () => {
    if (!newHoliday.date || !newHoliday.name.trim()) {
      toast("error", "Enter both a date and a name");
      return;
    }
    if (
      settings.holidays.some(
        (h) => h.date === newHoliday.date && (h.companyId ?? "") === newHoliday.companyId
      )
    ) {
      toast("error", "A holiday already exists on that date for this scope");
      return;
    }
    const holidays = [
      ...settings.holidays,
      {
        date: newHoliday.date,
        name: newHoliday.name.trim(),
        ...(newHoliday.companyId ? { companyId: newHoliday.companyId } : {}),
      },
    ].sort((a, b) => a.date.localeCompare(b.date));
    setSettings({ ...settings, holidays });
    setNewHoliday({ date: "", name: "", companyId: "" });
  };

  const removeHoliday = (date: string, companyId?: string) => {
    setSettings({
      ...settings,
      holidays: settings.holidays.filter(
        (h) => !(h.date === date && (h.companyId ?? "") === (companyId ?? ""))
      ),
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { id, ...data } = settings;
      if (id) {
        await updateDocument("settings", id, { ...data, updatedAt: Timestamp.now() });
      } else {
        await createDocument("settings", { ...data, createdAt: Timestamp.now() });
      }
      setSaved(true);
      toast("success", "Settings saved");
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save settings");
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

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      {/* Left settings navigation */}
      <aside className="w-full shrink-0 lg:w-56">
        <div className="glass-panel sticky top-24 rounded-[20px] p-2">
          <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:overflow-x-visible">
            {SETTINGS_TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === id
                    ? "bg-slate-950 text-white shadow-[0_8px_16px_rgba(15,23,42,0.12)]"
                    : "text-slate-600 hover:bg-white/70 hover:text-slate-950"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" /> {label}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Right content area */}
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex items-center justify-end">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>

        {saved && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            Settings saved successfully!
          </div>
        )}

      {/* General */}
      {activeTab === "general" && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" /> General Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Company Name</Label>
              <Input value={settings.companyName} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} />
            </div>
            <div>
              <Label>Default Currency</Label>
              <SelectRoot value={settings.defaultCurrency} onValueChange={(v) => setSettings({ ...settings, defaultCurrency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR (₹)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="AED">AED (د.إ)</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
            <div>
              <Label>Timezone</Label>
              <Input value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} />
            </div>
            <div>
              <Label>Financial Year Start (Month)</Label>
              <SelectRoot value={settings.financialYearStart} onValueChange={(v) => setSettings({ ...settings, financialYearStart: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map((m) => (
                    <SelectItem key={m} value={m}>
                      {new Date(2024, parseInt(m) - 1).toLocaleDateString("en", { month: "long" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>Company Address</Label>
              <Input
                value={settings.companyProfile.address}
                onChange={(e) => setSettings({ ...settings, companyProfile: { ...settings.companyProfile, address: e.target.value } })}
                placeholder="Street, City, State, PIN"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={settings.companyProfile.phone}
                onChange={(e) => setSettings({ ...settings, companyProfile: { ...settings.companyProfile, phone: e.target.value } })}
                placeholder="+91 ..."
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={settings.companyProfile.email}
                onChange={(e) => setSettings({ ...settings, companyProfile: { ...settings.companyProfile, email: e.target.value } })}
                placeholder="hello@company.com"
              />
            </div>
            <div>
              <Label>Website</Label>
              <Input
                value={settings.companyProfile.website}
                onChange={(e) => setSettings({ ...settings, companyProfile: { ...settings.companyProfile, website: e.target.value } })}
                placeholder="https://company.com"
              />
            </div>
            <div>
              <Label>Logo URL</Label>
              <Input
                value={settings.companyProfile.logoUrl}
                onChange={(e) => setSettings({ ...settings, companyProfile: { ...settings.companyProfile, logoUrl: e.target.value } })}
                placeholder="https://.../logo.png"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Tax & Invoice */}
      {activeTab === "tax" && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5" /> Tax & Invoice Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>GST Number</Label>
              <Input value={settings.gstNumber} onChange={(e) => setSettings({ ...settings, gstNumber: e.target.value })} placeholder="22AAAAA0000A1Z5" />
            </div>
            <div>
              <Label>PAN Number</Label>
              <Input value={settings.panNumber} onChange={(e) => setSettings({ ...settings, panNumber: e.target.value })} placeholder="AAAAA0000A" />
            </div>
            <div>
              <Label>Invoice Prefix</Label>
              <Input value={settings.invoicePrefix} onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value })} />
            </div>
            <div>
              <Label>Quotation Prefix</Label>
              <Input value={settings.quotationPrefix} onChange={(e) => setSettings({ ...settings, quotationPrefix: e.target.value })} />
            </div>
            <div>
              <Label>Default GST Rate (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={settings.defaultGstRate}
                onChange={(e) => setSettings({ ...settings, defaultGstRate: Number(e.target.value) })}
                placeholder="18"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Document Number Formats */}
      {activeTab === "numbering" && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Document Number Formats
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Configure how quotation, estimate, invoice and receipt numbers are generated. Tokens:
            <code className="mx-1 rounded bg-gray-100 px-1">{"{COMP}"}</code> company code,
            <code className="mx-1 rounded bg-gray-100 px-1">{"{YYYY}"}</code> FY start year,
            <code className="mx-1 rounded bg-gray-100 px-1">{"{YY}"}</code> 2-digit year,
            <code className="mx-1 rounded bg-gray-100 px-1">{"{FY}"}</code> FY label,
            <code className="mx-1 rounded bg-gray-100 px-1">{"{SEQ:3}"}</code> running number padded to 3 digits.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Quotation Format</Label>
              <Input
                value={settings.numberFormats?.quotation ?? ""}
                onChange={(e) => setSettings({ ...settings, numberFormats: { ...settings.numberFormats, quotation: e.target.value } })}
                placeholder="QTN-{COMP}/{YYYY}/{SEQ:3}"
              />
            </div>
            <div>
              <Label>Estimate Format</Label>
              <Input
                value={settings.numberFormats?.estimate ?? ""}
                onChange={(e) => setSettings({ ...settings, numberFormats: { ...settings.numberFormats, estimate: e.target.value } })}
                placeholder="EST-{COMP}-{YYYY}/{SEQ:3}"
              />
            </div>
            <div>
              <Label>Invoice Format</Label>
              <Input
                value={settings.numberFormats?.invoice ?? ""}
                onChange={(e) => setSettings({ ...settings, numberFormats: { ...settings.numberFormats, invoice: e.target.value } })}
                placeholder="INV-{COMP}/{YYYY}/{SEQ:3}"
              />
            </div>
            <div>
              <Label>Receipt Format</Label>
              <Input
                value={settings.numberFormats?.receipt ?? ""}
                onChange={(e) => setSettings({ ...settings, numberFormats: { ...settings.numberFormats, receipt: e.target.value } })}
                placeholder="RCPT-{COMP}/{YYYY}/{SEQ:3}"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Weekly Work Schedule */}
      {activeTab === "schedule" && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Weekly Work Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-gray-500">
            Set a default start/end time, then customize each day or mark it as a weekly off / leave day.
            These times drive late-arrival and early-departure detection in attendance.
          </p>

          {/* Default template */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end rounded-lg border border-gray-100 bg-gray-50/60 p-4">
            <div>
              <Label>Default Start Time</Label>
              <TimePicker
                value={settings.workingHours.start}
                onChange={(e) => setSettings({ ...settings, workingHours: { ...settings.workingHours, start: e.target.value } })}
              />
            </div>
            <div>
              <Label>Default End Time</Label>
              <TimePicker
                value={settings.workingHours.end}
                onChange={(e) => setSettings({ ...settings, workingHours: { ...settings.workingHours, end: e.target.value } })}
              />
            </div>
            <div>
              <Label>Late Threshold (minutes)</Label>
              <Input
                type="number"
                min={0}
                value={settings.lateThresholdMinutes}
                onChange={(e) => setSettings({ ...settings, lateThresholdMinutes: Number(e.target.value) })}
              />
            </div>
            <Button type="button" variant="outline" onClick={applyDefaultToAll}>
              Apply to all working days
            </Button>
          </div>

          {/* Per-day rows */}
          <div className="space-y-2">
            {WEEKDAYS_UI.map(({ key, label }) => {
              const day = settings.weeklySchedule[key];
              return (
                <div
                  key={key}
                  className="grid grid-cols-1 sm:grid-cols-[140px_1fr_1fr_auto] gap-3 sm:items-center rounded-lg border border-gray-100 p-3"
                >
                  <span className="font-medium text-sm">{label}</span>
                  <div>
                    <Label className="sm:hidden">Start</Label>
                    <TimePicker
                      value={day.start}
                      disabled={!day.enabled}
                      onChange={(e) => updateDay(key, { start: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="sm:hidden">End</Label>
                    <TimePicker
                      value={day.end}
                      disabled={!day.enabled}
                      onChange={(e) => updateDay(key, { end: e.target.value })}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm whitespace-nowrap justify-self-start sm:justify-self-end">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={day.enabled}
                      onChange={(e) => updateDay(key, { enabled: e.target.checked })}
                    />
                    {day.enabled ? "Working day" : "Off / Leave"}
                  </label>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Attendance Rules */}
      {activeTab === "attendance" && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" /> Attendance Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Full Day Hours</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={settings.attendanceRules.fullDayHours}
                onChange={(e) => setSettings({ ...settings, attendanceRules: { ...settings.attendanceRules, fullDayHours: Number(e.target.value) } })}
              />
            </div>
            <div>
              <Label>Half Day Hours</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={settings.attendanceRules.halfDayHours}
                onChange={(e) => setSettings({ ...settings, attendanceRules: { ...settings.attendanceRules, halfDayHours: Number(e.target.value) } })}
              />
            </div>
            <div>
              <Label>Overtime After (hours)</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={settings.attendanceRules.overtimeAfterHours}
                onChange={(e) => setSettings({ ...settings, attendanceRules: { ...settings.attendanceRules, overtimeAfterHours: Number(e.target.value) } })}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={settings.attendanceRules.locationRequired}
                  onChange={(e) => setSettings({ ...settings, attendanceRules: { ...settings.attendanceRules, locationRequired: e.target.checked } })}
                />
                Require location for check-in
              </label>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Hours worked at or above &ldquo;Full Day&rdquo; count as present; at or above &ldquo;Half Day&rdquo; count as a
            half day; anything less is marked absent. Hours beyond the overtime threshold are recorded as overtime.
          </p>
        </CardContent>
      </Card>
      )}

      {/* Holiday Calendar */}
      {activeTab === "holidays" && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5" /> Holiday Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Add public holidays or one-off company closures. These dates are treated as non-working days in attendance.
            Choose a company to limit a holiday to that company&apos;s staff, or leave it as &ldquo;All companies&rdquo;.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_180px_auto] gap-3 sm:items-end">
            <div>
              <Label>Date</Label>
              <DatePicker value={newHoliday.date} onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })} />
            </div>
            <div>
              <Label>Holiday Name</Label>
              <Input value={newHoliday.name} onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })} placeholder="e.g. Independence Day" />
            </div>
            <div>
              <Label>Company</Label>
              <SelectRoot
                value={newHoliday.companyId || "all"}
                onValueChange={(v) => setNewHoliday({ ...newHoliday, companyId: v === "all" ? "" : v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All companies</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            </div>
            <Button type="button" variant="outline" onClick={addHoliday}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          {settings.holidays.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">No holidays added yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {settings.holidays.map((h) => {
                const companyName = h.companyId ? companies.find((c) => c.id === h.companyId)?.name : null;
                return (
                  <div key={`${h.date}-${h.companyId ?? "all"}`} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium">{h.name}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(`${h.date}T00:00:00`).toLocaleDateString("en-IN", {
                          weekday: "short",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {companyName ?? "All companies"}
                      </span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeHoliday(h.date, h.companyId)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Leave Policy */}
      {activeTab === "leave" && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Leave Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Casual Leave (days/year)</Label>
              <Input type="number" min={0} value={settings.leavePolicy.casualLeave} onChange={(e) => setSettings({ ...settings, leavePolicy: { ...settings.leavePolicy, casualLeave: Number(e.target.value) } })} />
            </div>
            <div>
              <Label>Sick Leave (days/year)</Label>
              <Input type="number" min={0} value={settings.leavePolicy.sickLeave} onChange={(e) => setSettings({ ...settings, leavePolicy: { ...settings.leavePolicy, sickLeave: Number(e.target.value) } })} />
            </div>
            <div>
              <Label>Earned Leave (days/year)</Label>
              <Input type="number" min={0} value={settings.leavePolicy.earnedLeave} onChange={(e) => setSettings({ ...settings, leavePolicy: { ...settings.leavePolicy, earnedLeave: Number(e.target.value) } })} />
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Integrations */}
      {activeTab === "integrations" && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" /> Integrations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>WhatsApp Business API Key</Label>
            <Input type="password" value={settings.whatsappApiKey} onChange={(e) => setSettings({ ...settings, whatsappApiKey: e.target.value })} placeholder="Enter API key" />
            <p className="text-xs text-gray-500 mt-1">Used for sending WhatsApp messages via the Business API.</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="emailNotifications"
              checked={settings.emailNotifications}
              onChange={(e) => setSettings({ ...settings, emailNotifications: e.target.checked })}
              className="rounded"
            />
            <Label htmlFor="emailNotifications">Enable Email Notifications</Label>
          </div>
        </CardContent>
      </Card>
      )}
      </div>
    </div>
  );
}
