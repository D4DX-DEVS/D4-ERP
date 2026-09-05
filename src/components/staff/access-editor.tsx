"use client";

// Shared grant editor: the Edit Staff dialog and the staff profile Access tab
// render this so the two screens cannot drift. All decisions (grouping, row
// state, what a tick opens, which keys a bundle toggle touches) come from
// src/lib/access-editor.ts; this file only draws them and asks before enabling
// anything marked sensitive.

import { useMemo, useState } from "react";
import { AlertTriangle, Eye, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  accessSections,
  previewFor,
  sectionStatus,
  sensitiveKeys,
  setBundle,
  toggleKey,
  type AccessRow,
} from "@/lib/access-editor";
import { featureMeta, type FeatureKey } from "@/lib/permissions";

export interface AccessEditorProps {
  role: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** Who the grants are for; used in the confirmation copy. */
  subjectName: string;
  /** Read-only rendering for viewers who may not edit. */
  disabled?: boolean;
}

interface Pending {
  keys: FeatureKey[];
  next: string[];
}

/** Confirmation copy for enabling sensitive keys: "Payroll: Reveals…". */
export function sensitiveMessage(keys: FeatureKey[], subjectName: string): string {
  const lines = keys.map((k) => {
    const meta = featureMeta(k);
    return `${meta?.label ?? k}: ${meta?.sensitive ?? ""}`.trim();
  });
  return `${subjectName} will be able to see this. ${lines.join(" ")}`;
}

function Tag({ tone, children }: { tone: "indigo" | "gray" | "amber"; children: React.ReactNode }) {
  const tones = {
    indigo: "bg-indigo-100 text-indigo-700",
    gray: "bg-gray-100 text-gray-600",
    amber: "bg-amber-100 text-amber-800",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tones[tone]}`}>
      {children}
    </span>
  );
}

function includesLine(row: AccessRow): string | null {
  if (row.includes.length === 0) return null;
  if (row.opens === "sidebar") return `Adds to sidebar: ${row.includes.join(" · ")}`;
  if (row.includes[0] !== "Hub") return "Opens one page in the staff portal";
  return `Opens ${row.includes.length} pages in the staff portal: ${row.includes.join(" · ")}`;
}

function deadReason(row: AccessRow): string {
  return row.opens === "portal"
    ? "No staff-portal page exists for it yet."
    : "Nothing in the dashboard sidebar is gated by it for this role.";
}

function Row({ row, disabled, onToggle }: { row: AccessRow; disabled: boolean; onToggle: () => void }) {
  const locked = row.state === "role-default";
  const dead = row.state === "unsupported";
  const inert = disabled || locked || dead;
  const tone = locked
    ? "border-indigo-200 bg-indigo-50/50"
    : row.state === "granted"
      ? "border-indigo-500 bg-indigo-50/30"
      : dead
        ? "border-dashed opacity-70"
        : "hover:bg-gray-50";
  const pages = includesLine(row);
  return (
    <label className={`flex min-h-11 items-start gap-3 rounded-xl border p-3 transition-colors ${tone} ${inert ? "" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={locked || row.state === "granted"}
        disabled={inert}
        onChange={onToggle}
        aria-describedby={`access-${row.key}-desc`}
        className="mt-0.5 h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{row.label}</span>
          {locked && <Tag tone="indigo">Role default</Tag>}
          {dead && <Tag tone="gray">Not available for this role</Tag>}
          {row.sensitive && !dead && (
            <Tag tone="amber">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Sensitive
            </Tag>
          )}
        </div>
        <p id={`access-${row.key}-desc`} className="text-xs text-gray-500">
          {row.description}
        </p>
        {!locked && !dead && pages && <p className="mt-1 text-xs text-gray-700">{pages}</p>}
        {dead && <p className="mt-1 text-xs text-gray-500">{deadReason(row)}</p>}
        {!locked && !dead && row.note && <p className="mt-1 text-xs text-amber-700">{row.note}</p>}
        {!locked && !dead && row.sensitive && <p className="mt-1 text-xs text-amber-700">{row.sensitive}</p>}
      </div>
    </label>
  );
}

export function AccessEditor({ role, value, onChange, subjectName, disabled = false }: AccessEditorProps) {
  const [pending, setPending] = useState<Pending | null>(null);
  const sections = useMemo(() => accessSections(role, value), [role, value]);
  const preview = useMemo(() => previewFor(role, value), [role, value]);
  const portal = role === "staff";

  if (role === "admin") {
    return (
      <div className="py-8 text-center">
        <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-indigo-400" aria-hidden="true" />
        <p className="text-sm font-medium text-gray-600">Admins have access to all features</p>
      </div>
    );
  }

  const commit = (next: string[]) => {
    const added = next.filter((k) => !value.includes(k));
    const risky = sensitiveKeys(added);
    if (risky.length) setPending({ keys: risky, next });
    else onChange(next);
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        Locked items come with the <span className="font-semibold">{role}</span> role. Tick more to grant extra access; each
        row says what it opens.
      </p>

      {sections.map((section) => {
        const allOn = section.grantable.length > 0 && section.grantable.every((k) => value.includes(k));
        return (
          <section key={section.bundle} aria-labelledby={`access-bundle-${section.bundle}`}>
            <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
              <div className="min-w-0">
                <h4 id={`access-bundle-${section.bundle}`} className="text-sm font-semibold text-gray-900">
                  {section.bundle}
                </h4>
                <p className="text-xs text-gray-500">{sectionStatus(section, role)}</p>
              </div>
              {!disabled && section.grantable.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => commit(setBundle(value, section, !allOn))}>
                  {allOn ? "Remove all" : "Grant all"}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {section.rows.map((row) => (
                <Row key={row.key} row={row} disabled={disabled} onToggle={() => commit(toggleKey(value, row.key))} />
              ))}
            </div>
          </section>
        );
      })}

      <div className="rounded-xl border bg-gray-50 p-3 text-sm">
        <p className="flex items-center gap-2 font-medium text-gray-900">
          <Eye className="h-4 w-4 text-indigo-500" aria-hidden="true" />
          {portal ? "Staff portal preview" : "Sidebar preview"}
        </p>
        {preview.length === 0 ? (
          <p className="mt-1 text-xs text-gray-500">
            {portal ? "Nothing beyond the self-service pages every staff member has." : `Nothing beyond what the ${role} role already shows.`}
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-xs text-gray-700">
            {preview.map((s) => (
              <li key={s.section}>
                <span className="font-medium">{s.section}:</span>{" "}
                {s.modules
                  .map((m) => (portal ? `${m.label} (${m.pages} page${m.pages === 1 ? "" : "s"})` : m.label))
                  .join(" · ")}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        variant="warning"
        title="Grant sensitive access?"
        message={pending ? sensitiveMessage(pending.keys, subjectName) : ""}
        confirmLabel="Grant"
        onConfirm={() => {
          if (pending) onChange(pending.next);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
