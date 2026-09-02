"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Timestamp, createDocument, updateDocument } from "@/lib/firestore";
import { annualCost } from "@/lib/tool-status";
import { parseTotpInput } from "@/lib/totp";
import { useAuthStore } from "@/store/auth-store";
import type { CompanyTool, ToolBillingCycle, ToolLoginMethod } from "@/types";
import {
  BILLING_CYCLE_OPTIONS,
  CATEGORY_OPTIONS,
  LOGIN_METHOD_OPTIONS,
  toDateInput,
} from "./constants";

const EMPTY_FORM = {
  name: "",
  category: CATEGORY_OPTIONS[0].value,
  vendor: "",
  plan: "",
  url: "",
  description: "",
  username: "",
  password: "",
  loginMethod: "email-password" as ToolLoginMethod,
  twoFactorEnabled: false,
  recoveryEmail: "",
  recoveryPhone: "",
  licenseKey: "",
  totpSecret: "",
  credentialNotes: "",
  ownerStaffId: "",
  seatsTotal: "",
  seatsUsed: "",
  purchasedDate: "",
  renewalDate: "",
  billingCycle: "yearly" as ToolBillingCycle,
  cost: "",
  autoRenew: true,
  paymentMethod: "",
  invoiceUrl: "",
  cancelled: false,
  notes: "",
};

type FormState = typeof EMPTY_FORM;

/**
 * Mounted only while the dialog is open, and keyed on the record being edited,
 * so the form seeds itself once from props instead of syncing through an effect.
 */
interface ToolFormDialogProps {
  /** The tool being edited, or null to create a new one. */
  tool: (CompanyTool & { id: string }) | null;
  staffOptions: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}

function seedForm(tool: CompanyTool | null): FormState {
  if (!tool) return { ...EMPTY_FORM };
  const secret = tool.secret ?? {};
  return {
    name: tool.name ?? "",
    category: tool.category || CATEGORY_OPTIONS[0].value,
    vendor: tool.vendor ?? "",
    plan: tool.plan ?? "",
    url: tool.url ?? "",
    description: tool.description ?? "",
    username: tool.username ?? "",
    password: secret.password ?? "",
    loginMethod: tool.loginMethod ?? "email-password",
    twoFactorEnabled: !!tool.twoFactorEnabled,
    recoveryEmail: secret.recoveryEmail ?? "",
    recoveryPhone: secret.recoveryPhone ?? "",
    licenseKey: secret.licenseKey ?? "",
    totpSecret: secret.totpSecret ?? "",
    credentialNotes: secret.notes ?? "",
    ownerStaffId: tool.ownerStaffId ?? "",
    seatsTotal: tool.seatsTotal ? String(tool.seatsTotal) : "",
    seatsUsed: tool.seatsUsed ? String(tool.seatsUsed) : "",
    purchasedDate: toDateInput(tool.purchasedDate),
    renewalDate: toDateInput(tool.renewalDate),
    billingCycle: tool.billingCycle ?? "yearly",
    cost: tool.cost ? String(tool.cost) : "",
    autoRenew: tool.autoRenew ?? true,
    paymentMethod: tool.paymentMethod ?? "",
    invoiceUrl: tool.invoiceUrl ?? "",
    cancelled: !!tool.cancelled,
    notes: tool.notes ?? "",
  };
}

function toTimestamp(value: string) {
  return value ? Timestamp.fromDate(new Date(value)) : null;
}

export function ToolFormDialog({ tool, staffOptions, onClose, onSaved }: ToolFormDialogProps) {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => seedForm(tool));
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Validated as it is typed so a mistyped seed is caught here, not weeks later
  // when someone is locked out of the account.
  const totpEntered = form.totpSecret.trim() !== "";
  const totpParsed = totpEntered ? parseTotpInput(form.totpSecret) : null;
  const totpInvalid = totpEntered && !totpParsed;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const secret = {
        password: form.password.trim(),
        licenseKey: form.licenseKey.trim(),
        recoveryEmail: form.recoveryEmail.trim(),
        recoveryPhone: form.recoveryPhone.trim(),
        totpSecret: form.totpSecret.trim(),
        notes: form.credentialNotes.trim(),
      };
      const hasCredentials = Object.values(secret).some((v) => v !== "");
      const passwordChanged = form.password.trim() !== (tool?.secret?.password ?? "");

      const base = {
        name: form.name.trim(),
        category: form.category,
        vendor: form.vendor.trim(),
        plan: form.plan.trim(),
        url: form.url.trim(),
        description: form.description.trim(),
        username: form.username.trim(),
        loginMethod: form.loginMethod,
        // A stored authenticator seed is itself proof that 2-step is on.
        twoFactorEnabled: form.twoFactorEnabled || !!totpParsed,
        ownerStaffId: form.ownerStaffId,
        seatsTotal: Number(form.seatsTotal) || 0,
        seatsUsed: Number(form.seatsUsed) || 0,
        purchasedDate: toTimestamp(form.purchasedDate),
        renewalDate: toTimestamp(form.renewalDate),
        billingCycle: form.billingCycle,
        cost: Number(form.cost) || 0,
        autoRenew: form.autoRenew,
        paymentMethod: form.paymentMethod.trim(),
        invoiceUrl: form.invoiceUrl,
        cancelled: form.cancelled,
        notes: form.notes.trim(),
      };

      const payload: Record<string, unknown> = {
        ...base,
        // Summed server-side for the "annual spend" card, so it is stored, not derived.
        annualCost: annualCost({ ...base, name: base.name, category: base.category } as CompanyTool),
        hasCredentials,
        secret,
        lastPasswordChangedAt:
          passwordChanged && secret.password
            ? Timestamp.now()
            : tool?.lastPasswordChangedAt ?? null,
        lastVerifiedAt: Timestamp.now(),
      };

      if (tool) {
        await updateDocument("company_tools", tool.id, payload);
      } else {
        await createDocument("company_tools", {
          ...payload,
          createdBy: user?.uid ?? "",
          createdByName: user ? `${user.firstName} ${user.lastName}` : "",
        });
      }
      toast("success", tool ? "Tool updated" : "Tool added");
      onSaved();
    } catch (error) {
      console.error("Tool save failed:", error);
      toast("error", error instanceof Error ? error.message : "Failed to save tool");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>{tool ? "Edit tool" : "Add tool"}</DialogTitle>
        <DialogDescription>
          Credentials are encrypted before they are stored and are only visible to people with the
          Tools &amp; Accounts permission.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-6">
        {tool?.secretLocked && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            The stored credentials for this tool could not be decrypted, so the fields below start
            empty. Saving now replaces them.
          </p>
        )}

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Tool</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tool-name">Name *</Label>
              <Input id="tool-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Adobe Creative Cloud" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-category">Category *</Label>
              <Select id="tool-category" value={form.category} onChange={(e) => set("category", e.target.value)} options={CATEGORY_OPTIONS} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-vendor">Vendor</Label>
              <Input id="tool-vendor" value={form.vendor} onChange={(e) => set("vendor", e.target.value)} placeholder="e.g. Adobe Inc." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-plan">Plan</Label>
              <Input id="tool-plan" value={form.plan} onChange={(e) => set("plan", e.target.value)} placeholder="e.g. Teams, Pro" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="tool-url">Login URL</Label>
              <Input id="tool-url" type="url" value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://account.adobe.com" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="tool-description">What it is used for</Label>
              <Textarea id="tool-description" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Premiere Pro and After Effects for the video team" />
            </div>
          </div>
        </section>

        <section className="space-y-4 border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Account access</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tool-username">Username / email</Label>
              <Input id="tool-username" value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="accounts@d4media.in" autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-password">Password</Label>
              <div className="relative">
                <Input
                  id="tool-password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="Stored encrypted"
                  autoComplete="new-password"
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-login-method">Login method</Label>
              <Select id="tool-login-method" value={form.loginMethod} onChange={(e) => set("loginMethod", e.target.value as ToolLoginMethod)} options={LOGIN_METHOD_OPTIONS} />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input id="tool-2fa" type="checkbox" checked={form.twoFactorEnabled} onChange={(e) => set("twoFactorEnabled", e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
              <Label htmlFor="tool-2fa">Two-factor authentication is enabled</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-recovery-email">Recovery email</Label>
              <Input id="tool-recovery-email" value={form.recoveryEmail} onChange={(e) => set("recoveryEmail", e.target.value)} placeholder="Backup address on the account" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-recovery-phone">Recovery phone</Label>
              <Input id="tool-recovery-phone" value={form.recoveryPhone} onChange={(e) => set("recoveryPhone", e.target.value)} placeholder="Backup number on the account" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="tool-license">Licence / activation key</Label>
              <Input id="tool-license" value={form.licenseKey} onChange={(e) => set("licenseKey", e.target.value)} placeholder="Stored encrypted" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="tool-totp">Authenticator setup key</Label>
              <Input
                id="tool-totp"
                value={form.totpSecret}
                onChange={(e) => set("totpSecret", e.target.value)}
                placeholder="Paste the setup key shown beside the QR code, or the whole otpauth:// link"
                autoComplete="off"
                aria-invalid={totpInvalid}
                aria-describedby="tool-totp-help"
              />
              <p
                id="tool-totp-help"
                className={totpInvalid ? "flex items-center gap-1.5 text-xs text-red-600" : "text-xs text-slate-500"}
              >
                {totpInvalid ? (
                  <>
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    That is not a valid setup key. Copy the letters and numbers shown next to the QR
                    code, or the full otpauth:// link.
                  </>
                ) : totpParsed ? (
                  <>
                    Recognised{totpParsed.issuer ? ` (${totpParsed.issuer})` : ""} — the live{" "}
                    {totpParsed.digits}-digit code will appear on this tool&apos;s page. Storing it
                    here means the vault holds both factors, so grant this permission carefully.
                  </>
                ) : (
                  <>
                    Optional. Add it when 2-step uses an app like Google Authenticator, so signing in
                    does not depend on one person&apos;s phone.
                  </>
                )}
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="tool-credential-notes">Access notes</Label>
              <Textarea id="tool-credential-notes" value={form.credentialNotes} onChange={(e) => set("credentialNotes", e.target.value)} placeholder="e.g. 2FA codes go to the ops phone" />
            </div>
          </div>
        </section>

        <section className="space-y-4 border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Subscription</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="tool-purchased">Purchased on</Label>
              <DatePicker id="tool-purchased" value={form.purchasedDate} onChange={(e) => set("purchasedDate", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-renewal">Renews / expires on</Label>
              <DatePicker id="tool-renewal" value={form.renewalDate} onChange={(e) => set("renewalDate", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-cycle">Billing cycle</Label>
              <Select id="tool-cycle" value={form.billingCycle} onChange={(e) => set("billingCycle", e.target.value as ToolBillingCycle)} options={BILLING_CYCLE_OPTIONS} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-cost">Cost per cycle (₹)</Label>
              <Input id="tool-cost" type="number" min={0} step="0.01" value={form.cost} onChange={(e) => set("cost", e.target.value)} placeholder="e.g. 45000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-seats-total">Total seats</Label>
              <Input id="tool-seats-total" type="number" min={0} value={form.seatsTotal} onChange={(e) => set("seatsTotal", e.target.value)} placeholder="e.g. 10" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-seats-used">Seats in use</Label>
              <Input id="tool-seats-used" type="number" min={0} value={form.seatsUsed} onChange={(e) => set("seatsUsed", e.target.value)} placeholder="e.g. 8" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-owner">Owner</Label>
              <Select id="tool-owner" value={form.ownerStaffId} onChange={(e) => set("ownerStaffId", e.target.value)} options={staffOptions} placeholder="Who is responsible" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool-payment">Paid with</Label>
              <Input id="tool-payment" value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} placeholder="e.g. HDFC corporate card" />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input id="tool-auto-renew" type="checkbox" checked={form.autoRenew} onChange={(e) => set("autoRenew", e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
              <Label htmlFor="tool-auto-renew">Auto-renew is on</Label>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Never record full card numbers here — a description of the payment method is enough.
          </p>
        </section>

        <section className="space-y-4 border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Invoice &amp; notes</h3>
          <FileUpload
            label="Invoice or receipt"
            value={form.invoiceUrl}
            onChange={(url) => set("invoiceUrl", url)}
            folder="tool-invoices"
            accept=".pdf,image/*"
            preview="document"
          />
          <div className="space-y-2">
            <Label htmlFor="tool-notes">Notes</Label>
            <Textarea id="tool-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything the next person needs to know" />
          </div>
          <div className="flex items-center gap-3">
            <input id="tool-cancelled" type="checkbox" checked={form.cancelled} onChange={(e) => set("cancelled", e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            <Label htmlFor="tool-cancelled">Cancelled — stop counting this towards spend</Label>
          </div>
        </section>

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || totpInvalid}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {tool ? "Save changes" : "Add tool"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
