"use client";

// Staff profile "Access & Features" tab: draft/saved diffing, save bar that
// stays reachable on mobile, copy-from-colleague, clear-all, and the last
// recorded change from the audit log. The grid itself is the shared AccessEditor.

import { useEffect, useMemo, useState } from "react";
import { Eraser, History, Loader2, RotateCcw, Save } from "lucide-react";
import type { Staff } from "@/types";
import { getDocuments, limit, orderBy, updateDocument, where } from "@/lib/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { AccessEditor, sensitiveMessage } from "@/components/staff/access-editor";
import { grantDiff, sanitizeForRole, sensitiveKeys } from "@/lib/access-editor";
import { featureMeta, type FeatureKey } from "@/lib/permissions";

interface AccessTabProps {
  staffId: string;
  staff: Staff;
  canEdit: boolean;
  onSaved: () => Promise<void> | void;
}

interface AuditRow {
  userName?: string;
  timestamp?: { seconds: number } | null;
  createdAt?: { seconds: number } | null;
  newData?: Record<string, unknown> | null;
}

interface LastChange {
  by: string;
  at: Date | null;
}

type Peer = Staff & { id: string };

const MAX_LISTED = 4;

function labelOf(key: string): string {
  return featureMeta(key)?.label ?? key;
}

function fullName(s: Pick<Staff, "firstName" | "lastName">): string {
  return `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim();
}

function summarize(added: string[], removed: string[]): string {
  const parts = [...added.map((k) => `+${labelOf(k)}`), ...removed.map((k) => `−${labelOf(k)}`)];
  const shown = parts.slice(0, MAX_LISTED).join(", ");
  const rest = parts.length - MAX_LISTED;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

/** Newest audit row that touched grantedFeatures (the DB route logs every staff update with its payload). */
async function fetchLastChange(staffId: string): Promise<LastChange | null> {
  const rows = await getDocuments<AuditRow>("audit_logs", [
    where("module", "==", "staff"),
    where("entityId", "==", staffId),
    orderBy("createdAt", "desc"),
    limit(30),
  ]);
  const hit = rows.find((r) => r.newData && Object.prototype.hasOwnProperty.call(r.newData, "grantedFeatures"));
  if (!hit) return null;
  const ts = hit.createdAt ?? hit.timestamp;
  return { by: hit.userName || "Unknown", at: ts ? new Date(ts.seconds * 1000) : null };
}

/** Colleagues whose grants can be copied: not this person, not admins, and holding at least one grant. */
async function fetchPeers(staffId: string): Promise<Peer[]> {
  const all = await getDocuments<Staff>("staff", []);
  return all
    .filter((s) => s.id !== staffId && s.role !== "admin" && (s.grantedFeatures?.length ?? 0) > 0)
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));
}

function formatWhen(d: Date): string {
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AccessTab({ staffId, staff, canEdit, onSaved }: AccessTabProps) {
  const { toast } = useToast();
  const editable = canEdit && staff.role !== "admin";
  const saved = useMemo(() => (Array.isArray(staff.grantedFeatures) ? staff.grantedFeatures : []), [staff.grantedFeatures]);
  const savedKey = saved.join("|");

  const [draft, setDraft] = useState<string[]>(saved);
  const [seenKey, setSeenKey] = useState(savedKey);
  const [saving, setSaving] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [pendingCopy, setPendingCopy] = useState<{ keys: FeatureKey[]; next: string[] } | null>(null);
  const [lastChange, setLastChange] = useState<LastChange | null | undefined>(undefined);

  // A refetch after save (or another admin changing the record) resets the draft
  // to what the server holds. Done during render, as React recommends for
  // state that follows a prop, rather than one render late in an effect.
  if (seenKey !== savedKey) {
    setSeenKey(savedKey);
    setDraft(saved);
  }

  const diff = useMemo(() => grantDiff(saved, draft), [saved, draft]);
  const dirty = diff.count > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    let cancelled = false;
    fetchLastChange(staffId)
      .then((v) => {
        if (!cancelled) setLastChange(v);
      })
      .catch(() => {
        if (!cancelled) setLastChange(null);
      });
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  useEffect(() => {
    if (!editable) return;
    let cancelled = false;
    fetchPeers(staffId)
      .then((list) => {
        if (!cancelled) setPeers(list);
      })
      .catch(() => {
        if (!cancelled) setPeers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [editable, staffId]);

  const handleSave = async () => {
    const n = diff.count;
    setSaving(true);
    try {
      await updateDocument("staff", staffId, { grantedFeatures: draft });
      // Re-read before declaring success so the boxes reflect what the server stored.
      await onSaved();
      setLastChange(await fetchLastChange(staffId).catch(() => null));
      setCopyNote(null);
      toast("success", `Access updated · ${n} change${n === 1 ? "" : "s"}`);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to update access");
    } finally {
      setSaving(false);
    }
  };

  const copyFrom = (id: string) => {
    const source = peers.find((p) => p.id === id);
    if (!source) return;
    const next = sanitizeForRole(staff.role, source.grantedFeatures ?? []);
    const skipped = (source.grantedFeatures?.length ?? 0) - next.length;
    setCopyNote(
      skipped > 0
        ? `Copied from ${fullName(source)}; ${skipped} item${skipped === 1 ? "" : "s"} not applicable to the ${staff.role} role skipped.`
        : `Copied from ${fullName(source)}.`
    );
    const risky = sensitiveKeys(next.filter((k) => !draft.includes(k)));
    if (risky.length) setPendingCopy({ keys: risky, next });
    else setDraft(next);
  };

  const name = fullName(staff) || "This staff member";
  const lastLine =
    lastChange === undefined
      ? "Loading change history…"
      : lastChange === null
        ? "No access changes recorded yet."
        : `Last changed by ${lastChange.by}${lastChange.at ? ` on ${formatWhen(lastChange.at)}` : ""}`;

  const peerOptions = peers.map((p) => {
    const n = p.grantedFeatures?.length ?? 0;
    return { value: p.id, label: `${fullName(p)} · ${p.role} · ${n} grant${n === 1 ? "" : "s"}` };
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-base">Access &amp; Features</CardTitle>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
              <History className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{lastLine}</span>
            </p>
          </div>
          {editable && (
            <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
              <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
                <Label htmlFor="copy-access" className="text-xs">
                  Copy access from
                </Label>
                <Select
                  id="copy-access"
                  value=""
                  options={peerOptions}
                  placeholder={peers.length ? "Choose a colleague…" : "No colleague has extra access"}
                  disabled={peers.length === 0 || saving}
                  onChange={(e) => copyFrom(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={draft.length === 0 || saving}
                onClick={() => setDraft([])}
              >
                <Eraser className="h-4 w-4" aria-hidden="true" />
                Clear all
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <AccessEditor role={staff.role} value={draft} onChange={setDraft} subjectName={name} disabled={!editable} />
          {copyNote && <p className="mt-3 text-xs text-gray-500">{copyNote}</p>}
        </CardContent>
      </Card>

      {editable && (
        <div
          role="region"
          aria-label="Save access changes"
          className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] z-10 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-lg backdrop-blur lg:bottom-4"
        >
          <p className="min-w-0 basis-full text-sm text-gray-700 sm:flex-1 sm:basis-auto" aria-live="polite">
            {dirty ? (
              <>
                <span className="font-medium">
                  {diff.count} unsaved change{diff.count === 1 ? "" : "s"}:
                </span>{" "}
                {summarize(diff.added, diff.removed)}
              </>
            ) : (
              "All changes saved"
            )}
          </p>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={!dirty || saving} onClick={() => setDraft(saved)}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset
            </Button>
            <Button type="button" size="sm" className="min-h-11" disabled={!dirty || saving} onClick={handleSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {dirty ? `Save ${diff.count} change${diff.count === 1 ? "" : "s"}` : "Saved"}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingCopy !== null}
        variant="warning"
        title="Copy sensitive access?"
        message={pendingCopy ? sensitiveMessage(pendingCopy.keys, name) : ""}
        confirmLabel="Copy"
        onConfirm={() => {
          if (pendingCopy) setDraft(pendingCopy.next);
          setPendingCopy(null);
        }}
        onCancel={() => {
          setPendingCopy(null);
          setCopyNote(null);
        }}
      />
    </>
  );
}
