"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Pencil,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  annualCost,
  renewalLabel,
  seatUsage,
  toolSecurityFlags,
  toolStatus,
  toolStatusBadge,
} from "@/lib/tool-status";
import { generateTotp, parseTotpInput, totpSecondsRemaining } from "@/lib/totp";
import type { CompanyTool } from "@/types";
import { BILLING_CYCLE_OPTIONS, LOGIN_METHOD_OPTIONS, toDateInput } from "./constants";

interface ToolDetailDialogProps {
  tool: CompanyTool & { id: string };
  ownerName: string;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function optionLabel(options: { value: string; label: string }[], value?: string) {
  return options.find((o) => o.value === value)?.label ?? "—";
}

function displayDate(value: unknown): string {
  const iso = toDateInput(value);
  return iso ? formatDate(new Date(iso)) : "—";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

/** A stored credential: masked until revealed, with a copy button. */
function SecretField({ label, value, secret }: { label: string; value?: string; secret?: boolean }) {
  const { toast } = useToast();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("error", "Your browser blocked copying to the clipboard");
    }
  };

  if (!value) return <Field label={label}>—</Field>;

  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-sm">
          {secret && !revealed ? "••••••••••••" : value}
        </span>
        {secret && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </Field>
  );
}

/**
 * The rotating 2-step code for accounts whose authenticator seed is stored, so a
 * shared login is not gated on one person's phone. Regenerated every second —
 * one HMAC, and it can never drift out of sync with the countdown.
 */
function AuthenticatorCode({ secret }: { secret: string }) {
  const { toast } = useToast();
  const config = useMemo(() => parseTotpInput(secret), [secret]);
  const [code, setCode] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!config) return;
    let alive = true;

    async function tick() {
      const now = Date.now();
      try {
        const next = await generateTotp(config!, now);
        if (!alive) return;
        setCode(next);
        setRemaining(totpSecondsRemaining(config!.period, now));
        setError(null);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Could not generate a code.");
      }
    }

    void tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [config]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("error", "Your browser blocked copying to the clipboard");
    }
  };

  if (!config) {
    return (
      <Field label="Authenticator code">
        <span className="text-amber-700">Stored setup key is not readable — re-add it to get codes.</span>
      </Field>
    );
  }
  if (error) {
    return (
      <Field label="Authenticator code">
        <span className="text-amber-700">{error}</span>
      </Field>
    );
  }

  const expiringSoon = remaining <= 5;
  // Split into halves the way authenticator apps do, so it is easy to read aloud.
  const half = Math.ceil(code.length / 2);

  return (
    <Field label="Authenticator code">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xl tracking-[0.18em] tabular-nums text-slate-900">
          {code ? `${code.slice(0, half)} ${code.slice(half)}` : "······"}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={
              expiringSoon
                ? "text-xs font-medium tabular-nums text-amber-600"
                : "text-xs tabular-nums text-slate-500"
            }
          >
            {remaining}s
          </span>
          <div className="h-1 w-12 overflow-hidden rounded-full bg-slate-200">
            <div
              className={expiringSoon ? "h-full bg-amber-500" : "h-full bg-indigo-500"}
              style={{ width: `${(remaining / config.period) * 100}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy authenticator code"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </Field>
  );
}

export function ToolDetailDialog({ tool, ownerName, onEdit, onDelete, onClose }: ToolDetailDialogProps) {
  const status = toolStatus(tool);
  const badge = toolStatusBadge(status);
  const flags = toolSecurityFlags(tool);
  const seats = seatUsage(tool);
  const secret = tool.secret ?? {};

  return (
    <Dialog open onClose={onClose} className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>{tool.name}</DialogTitle>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={badge.className}>{badge.label}</Badge>
          <Badge>{tool.category}</Badge>
          <span className="text-sm text-slate-500">{renewalLabel(tool)}</span>
        </div>
      </DialogHeader>

      <div className="space-y-6">
        {tool.secretLocked && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Stored credentials could not be decrypted — the vault key has changed since they were
            saved. Edit this tool to enter them again.
          </p>
        )}

        {flags.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
              <ShieldAlert className="h-4 w-4" /> Needs attention
            </p>
            <ul className="space-y-1 text-sm text-amber-800">
              {flags.map((flag) => (
                <li key={flag.key}>• {flag.label}</li>
              ))}
            </ul>
          </div>
        )}

        {tool.description && <p className="text-sm text-slate-600">{tool.description}</p>}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Account</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <SecretField label="Username / email" value={tool.username} />
            <SecretField label="Password" value={secret.password} secret />
            {secret.totpSecret ? <AuthenticatorCode secret={secret.totpSecret} /> : null}
            <SecretField label="Licence key" value={secret.licenseKey} secret />
            <Field label="Login method">{optionLabel(LOGIN_METHOD_OPTIONS, tool.loginMethod)}</Field>
            <Field label="Two-factor">
              {tool.twoFactorEnabled ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="bg-green-100 text-green-800">Enabled</Badge>
                  <span className="text-xs text-slate-500">
                    {secret.totpSecret
                      ? "codes available here"
                      : "code comes from the owner's device"}
                  </span>
                </div>
              ) : (
                <Badge variant="bg-red-100 text-red-800">Off</Badge>
              )}
            </Field>
            <Field label="Password last changed">{displayDate(tool.lastPasswordChangedAt)}</Field>
            <SecretField label="Recovery email" value={secret.recoveryEmail} />
            <SecretField label="Recovery phone" value={secret.recoveryPhone} />
            {tool.url && (
              <Field label="Login page">
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-700 hover:underline"
                >
                  Open <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Field>
            )}
            {secret.notes && (
              <div className="sm:col-span-2">
                <Field label="Access notes">
                  <span className="whitespace-pre-wrap">{secret.notes}</span>
                </Field>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3 border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Subscription</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Vendor">{tool.vendor || "—"}</Field>
            <Field label="Plan">{tool.plan || "—"}</Field>
            <Field label="Owner">{ownerName}</Field>
            <Field label="Cost">
              {tool.cost
                ? `${formatCurrency(tool.cost)} / ${optionLabel(BILLING_CYCLE_OPTIONS, tool.billingCycle).toLowerCase()}`
                : "—"}
            </Field>
            <Field label="Yearly run-rate">{formatCurrency(annualCost(tool))}</Field>
            <Field label="Auto-renew">{tool.autoRenew ? "On" : "Off"}</Field>
            <Field label="Purchased">{displayDate(tool.purchasedDate)}</Field>
            <Field label="Renews / expires">{displayDate(tool.renewalDate)}</Field>
            <Field label="Paid with">{tool.paymentMethod || "—"}</Field>
            <div className="sm:col-span-3">
              <Field label="Seats">
                {seats ? (
                  <div className="space-y-1.5">
                    <p>
                      {seats.used} of {seats.total} in use
                      {seats.free > 0 ? ` · ${seats.free} free` : " · fully allocated"}
                    </p>
                    <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={seats.pct >= 90 ? "h-full bg-amber-500" : "h-full bg-indigo-500"}
                        style={{ width: `${seats.pct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  "Not tracked"
                )}
              </Field>
            </div>
          </div>
        </section>

        {(tool.invoiceUrl || tool.notes) && (
          <section className="space-y-3 border-t border-slate-200 pt-5">
            <h3 className="text-sm font-semibold text-slate-900">Invoice &amp; notes</h3>
            {tool.invoiceUrl && (
              <a
                href={tool.invoiceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-indigo-700 hover:underline"
              >
                <FileText className="h-4 w-4" /> View invoice
              </a>
            )}
            {tool.notes && <p className="whitespace-pre-wrap text-sm text-slate-600">{tool.notes}</p>}
          </section>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">
            {tool.createdByName ? `Added by ${tool.createdByName}` : "Added"}
            {tool.lastVerifiedAt ? ` · last updated ${displayDate(tool.lastVerifiedAt)}` : ""}
          </p>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4 text-red-500" /> Delete
            </Button>
            <Button type="button" onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
