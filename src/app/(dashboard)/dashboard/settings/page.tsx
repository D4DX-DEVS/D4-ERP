"use client";

import { useEffect, useState } from "react";
import { getDocuments, createDocument, updateDocument, Timestamp } from "@/lib/firestore";
import { Company } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Settings as SettingsIcon, Building, Save, Globe, Clock, IndianRupee, Mail } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface AppSettings {
  id?: string;
  companyName: string;
  defaultCurrency: string;
  dateFormat: string;
  financialYearStart: string;
  timezone: string;
  leavePolicy: {
    casualLeave: number;
    sickLeave: number;
    earnedLeave: number;
  };
  workingHours: {
    start: string;
    end: string;
  };
  lateThresholdMinutes: number;
  emailNotifications: boolean;
  whatsappApiKey: string;
  gstNumber: string;
  panNumber: string;
  invoicePrefix: string;
  quotationPrefix: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  companyName: "D4 Media",
  defaultCurrency: "INR",
  dateFormat: "DD/MM/YYYY",
  financialYearStart: "04",
  timezone: "Asia/Kolkata",
  leavePolicy: { casualLeave: 12, sickLeave: 12, earnedLeave: 15 },
  workingHours: { start: "09:30", end: "18:30" },
  lateThresholdMinutes: 15,
  emailNotifications: true,
  whatsappApiKey: "",
  gstNumber: "",
  panNumber: "",
  invoicePrefix: "INV",
  quotationPrefix: "QTN",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await getDocuments<AppSettings>("settings");
        if (data.length > 0) {
          setSettings({ ...DEFAULT_SETTINGS, ...data[0], id: data[0].id });
        }
      } catch (error) {
        console.error("Error:", error);
        toast("error", "Failed to load settings");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
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
        </CardContent>
      </Card>

      {/* Tax & Invoice */}
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
          </div>
        </CardContent>
      </Card>

      {/* Working Hours & Leave */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Working Hours & Leave Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Work Start Time</Label>
              <Input type="time" value={settings.workingHours.start} onChange={(e) => setSettings({ ...settings, workingHours: { ...settings.workingHours, start: e.target.value } })} />
            </div>
            <div>
              <Label>Work End Time</Label>
              <Input type="time" value={settings.workingHours.end} onChange={(e) => setSettings({ ...settings, workingHours: { ...settings.workingHours, end: e.target.value } })} />
            </div>
            <div>
              <Label>Late Threshold (minutes)</Label>
              <Input type="number" value={settings.lateThresholdMinutes} onChange={(e) => setSettings({ ...settings, lateThresholdMinutes: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Casual Leave (days/year)</Label>
              <Input type="number" value={settings.leavePolicy.casualLeave} onChange={(e) => setSettings({ ...settings, leavePolicy: { ...settings.leavePolicy, casualLeave: Number(e.target.value) } })} />
            </div>
            <div>
              <Label>Sick Leave (days/year)</Label>
              <Input type="number" value={settings.leavePolicy.sickLeave} onChange={(e) => setSettings({ ...settings, leavePolicy: { ...settings.leavePolicy, sickLeave: Number(e.target.value) } })} />
            </div>
            <div>
              <Label>Earned Leave (days/year)</Label>
              <Input type="number" value={settings.leavePolicy.earnedLeave} onChange={(e) => setSettings({ ...settings, leavePolicy: { ...settings.leavePolicy, earnedLeave: Number(e.target.value) } })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrations */}
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
    </div>
  );
}
