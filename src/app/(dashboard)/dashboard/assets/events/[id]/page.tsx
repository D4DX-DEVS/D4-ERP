"use client";
import { useWorkspaceBase } from "@/hooks/use-workspace-base";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Asset, AssetEvent, AssetMovement, AssetPerson, StudioBooking } from "@/types";
import { getDocuments, getDocument, where, Timestamp } from "@/lib/firestore";
import { itemBusyReason, type AvailabilityContext, type BusyReason } from "@/lib/asset-availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageLoader } from "@/components/ui/loading";
import { ArrowLeft, CheckCircle2, Circle, Package, Search, SendHorizonal, X, AlertTriangle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useAuthStore } from "@/store/auth-store";
import { formatDate } from "@/lib/utils";

type ReturnCondition = "good" | "damaged" | "defective" | "missing";

interface AssetRow {
  asset: Asset & { id: string };
  movement: (AssetMovement & { id: string }) | null;
  inlineOpen: boolean;
  noteOpen: boolean;
  returnCondition: ReturnCondition;
  returnRemarks: string;
  returnBy: string;
  returnVerifiedBy: string;
  saving: boolean;
}

const statusColors: Record<string, string> = {
  upcoming: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-800",
};

const conditionBadge: Record<ReturnCondition, string> = {
  good: "bg-green-100 text-green-800",
  damaged: "bg-amber-100 text-amber-800",
  defective: "bg-orange-100 text-orange-800",
  missing: "bg-red-100 text-red-800",
};

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const base = useWorkspaceBase();
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [event, setEvent] = useState<(AssetEvent & { id: string }) | null>(null);
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Cross-availability inputs: commitments outside THIS event.
  const [allOutMovements, setAllOutMovements] = useState<AssetMovement[]>([]);
  const [allAssetEvents, setAllAssetEvents] = useState<(AssetEvent & { id: string })[]>([]);
  const [studioBookings, setStudioBookings] = useState<StudioBooking[]>([]);

  // Batch OUT state
  const [pendingOutIds, setPendingOutIds] = useState<Set<string>>(new Set());
  const [submittingOut, setSubmittingOut] = useState(false);
  const [showOutConfirm, setShowOutConfirm] = useState(false);
  type OutCondition = { condition: ReturnCondition; damageReason: string; remarks: string };
  const [outConditions, setOutConditions] = useState<Record<string, OutCondition>>({});

  // ── Fetch ─────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [eventData, assets, movements, allOut, allEvents, bookings] = await Promise.all([
        getDocument<AssetEvent>("asset-events", id),
        getDocuments<Asset>("assets", [where("isActive", "!=", false)]),
        getDocuments<AssetMovement>("asset-movements", [where("eventId", "==", id)]),
        getDocuments<AssetMovement>("asset-movements", [where("status", "==", "OUT")]),
        getDocuments<AssetEvent>("asset-events", []),
        getDocuments<StudioBooking>("studio_bookings", []),
      ]);

      if (eventData) setEvent(eventData);
      setAllOutMovements(allOut);
      setAllAssetEvents(allEvents);
      setStudioBookings(bookings);

      const movMap = new Map<string, AssetMovement & { id: string }>();
      for (const m of movements) {
        // Keep latest movement per asset (prefer OUT over IN for current state)
        const existing = movMap.get(m.assetId);
        if (!existing || m.status === "OUT") {
          movMap.set(m.assetId, m);
        }
      }

      setRows(
        assets.map((asset) => ({
          asset: { ...asset, allowOutside: asset.allowOutside !== false },
          movement: movMap.get(asset.id) ?? null,
          inlineOpen: false,
          noteOpen: false,
          returnCondition: "good",
          returnRemarks: "",
          returnBy: "",
          returnVerifiedBy: "",
          saving: false,
        }))
      );
    } catch (error) {
      console.error("Error fetching event detail:", error);
      toast("error", "Failed to load event details");
    }
    setLoading(false);
  }, [id, toast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Row helper ────────────────────────────────────────────────────────
  const setRow = useCallback((assetId: string, patch: Partial<AssetRow>) => {
    setRows((prev) => prev.map((r) => (r.asset.id === assetId ? { ...r, ...patch } : r)));
  }, []);

  // ── Batch OUT ─────────────────────────────────────────────────────────
  const togglePendingOut = useCallback((assetId: string) => {
    setPendingOutIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId); else next.add(assetId);
      return next;
    });
  }, []);

  async function submitOutWithConditions() {
    if (pendingOutIds.size === 0 || !event) return;
    setSubmittingOut(true);

    const results = await Promise.all(
      [...pendingOutIds].map((assetId) => {
        const row = rows.find(r => r.asset.id === assetId);
        const cond = outConditions[assetId] ?? { condition: "good", damageReason: "", remarks: "" };
        return fetch("/api/assets/movements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "checkout",
            assetId,
            assetName: row?.asset.name || "",
            assetCategory: row?.asset.category || "",
            eventId: id,
            eventName: event.name,
            eventLocation: event.location,
            allocatedPersonId: event.responsiblePersonId,
            allocatedPersonName: event.responsiblePersonName || "",
            outByName: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "System",
            condition: cond.condition,
            damageReason: cond.damageReason || undefined,
            remarks: cond.remarks || undefined,
          }),
        }).then(r => r.json());
      })
    );

    setSubmittingOut(false);
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      toast("error", `${failed.length} asset(s) could not be issued: ${failed[0]?.error || "Unknown error"}`);
    } else {
      toast("success", `${pendingOutIds.size} asset(s) issued`);
    }
    setPendingOutIds(new Set());
    setShowOutConfirm(false);
    setOutConditions({});
    fetchAll();
  }

  // ── Return ────────────────────────────────────────────────────────────
  const returnAsset = useCallback(async (row: AssetRow) => {
    if (!row.movement) return;
    setRow(row.asset.id, { saving: true });
    try {
      const res = await fetch("/api/assets/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "return",
          movementId: row.movement.id,
          condition: row.returnCondition,
          remarks: row.returnRemarks || undefined,
          returnBy: row.returnBy || undefined,
          verifiedBy: row.returnVerifiedBy || undefined,
          userName: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "System",
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast("success", "Asset returned");
        fetchAll();
      } else {
        toast("error", data.error || "Return failed");
        setRow(row.asset.id, { saving: false });
      }
    } catch {
      toast("error", "Return failed");
      setRow(row.asset.id, { saving: false });
    }
  }, [setRow, fetchAll, toast, user]);

  // ── Filter ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.asset.name.toLowerCase().includes(q) ||
      (r.asset.category || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, AssetRow[]>();
    for (const row of filtered) {
      const cat = row.asset.category || "other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(row);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Assets committed elsewhere (studio booking or another event) during THIS
  // event's window cannot be issued here.
  const crossBusy = useMemo(() => {
    const map = new Map<string, BusyReason>();
    if (!event) return map;
    const ctx: AvailabilityContext = {
      outMovements: allOutMovements,
      assetEvents: allAssetEvents,
      studioBookings,
      ignoreEventId: id,
    };
    const win = { kind: "event" as const, fromDate: event.fromDate, toDate: event.toDate };
    for (const r of rows) {
      if (r.movement) continue; // already tracked for this event
      const res = itemBusyReason({ id: r.asset.id, kind: "asset" }, win, ctx);
      if (res.busy && res.reason) map.set(r.asset.id, res.reason);
    }
    return map;
  }, [event, rows, allOutMovements, allAssetEvents, studioBookings, id]);

  const tsToDateStr = (ts?: Timestamp) => {
    if (!ts?.seconds) return "—";
    return formatDate(new Date(ts.seconds * 1000));
  };

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading) return <PageLoader />;

  if (!event) {
    return (
      <div className="py-12 text-center text-gray-500">
        Event not found.{" "}
        <button onClick={() => router.push(`${base}/assets/events`)} className="text-blue-600 underline">Back to Events</button>
      </div>
    );
  }

  const availableCount = rows.filter(r => r.movement === null).length;
  const issuedCount = rows.filter(r => r.movement?.status === "OUT").length;
  const returnedCount = rows.filter(r => r.movement?.status === "IN").length;

  return (
    <div className="space-y-6">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`${base}/assets/events`)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{event.name}</h1>
          <p className="text-sm text-gray-500 truncate">{event.location}</p>
        </div>
        <Badge variant={statusColors[event.status] || "bg-gray-100 text-gray-800"}>{event.status}</Badge>
      </div>

      {/* Event info card */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">From</p>
              <p className="font-medium">{tsToDateStr(event.fromDate)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">To</p>
              <p className="font-medium">{tsToDateStr(event.toDate)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Responsible</p>
              <p className="font-medium">{event.responsiblePersonName || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Summary</p>
              <div className="flex gap-3 text-xs mt-1">
                <span className="text-gray-500">{availableCount} available</span>
                <span className="text-orange-600">{issuedCount} issued</span>
                <span className="text-green-600">{returnedCount} returned</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search + batch OUT button */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search assets or category..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        {pendingOutIds.size > 0 && (
          <Button onClick={() => { setOutConditions({}); setShowOutConfirm(true); }}>
            <SendHorizonal className="h-4 w-4 mr-2" />
            Issue {pendingOutIds.size} item{pendingOutIds.size !== 1 ? "s" : ""}
          </Button>
        )}
      </div>

      {/* OUT Confirm Dialog */}
      <Dialog open={showOutConfirm} onClose={() => setShowOutConfirm(false)} className="max-w-lg">
        <DialogHeader><DialogTitle>Issue {pendingOutIds.size} item{pendingOutIds.size !== 1 ? "s" : ""}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100 -mx-1 px-1">
          {[...pendingOutIds].map((assetId) => {
            const assetName = rows.find(r => r.asset.id === assetId)?.asset.name ?? assetId;
            const cond = outConditions[assetId] ?? { condition: "good" as ReturnCondition, damageReason: "", remarks: "" };
            return (
              <div key={assetId} className="py-3 space-y-2">
                <p className="text-sm font-medium">{assetName}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Condition</Label>
                    <Select value={cond.condition} onChange={(e) => setOutConditions(prev => ({ ...prev, [assetId]: { ...cond, condition: e.target.value as ReturnCondition } }))}
                      options={[{ value: "good", label: "Good" }, { value: "damaged", label: "Damaged" }, { value: "defective", label: "Defective" }, { value: "missing", label: "Missing" }]} />
                  </div>
                  {cond.condition !== "good" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Reason</Label>
                      <Input value={cond.damageReason} onChange={(e) => setOutConditions(prev => ({ ...prev, [assetId]: { ...cond, damageReason: e.target.value } }))} placeholder="Describe issue..." />
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Remark (optional)</Label>
                  <Input value={cond.remarks} onChange={(e) => setOutConditions(prev => ({ ...prev, [assetId]: { ...cond, remarks: e.target.value } }))} placeholder="Notes..." />
                </div>
                {cond.condition !== "good" && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>A damage report will be created on issue.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t mt-4">
          <Button variant="outline" onClick={() => setShowOutConfirm(false)}>Cancel</Button>
          <Button onClick={submitOutWithConditions} disabled={submittingOut}>
            {submittingOut ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <SendHorizonal className="h-4 w-4 mr-2" />}
            {submittingOut ? "Issuing..." : "Confirm & Issue"}
          </Button>
        </div>
      </Dialog>

      {/* Category-grouped asset list */}
      {rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-400">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No assets found
        </CardContent></Card>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-gray-400">No results for &quot;{search}&quot;</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([category, catRows]) => (
            <Card key={category}>
              <CardContent className="p-0">
                {/* Category header */}
                <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-[24px]">
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">{category}</span>
                  <span className="text-xs text-gray-400">{catRows.length} item{catRows.length !== 1 ? "s" : ""}</span>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[1fr_80px_80px_100px_120px] bg-gray-50/30 border-b border-gray-100 px-4 py-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Item</span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">OUT</span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">IN</span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Condition</span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Remarks</span>
                </div>

                {/* Rows */}
                <div className="divide-y divide-gray-50">
                  {catRows.map((row) => {
                    const { asset, movement, inlineOpen, noteOpen, returnCondition, returnRemarks, returnBy, returnVerifiedBy, saving } = row;
                    const isAvailable = movement === null;
                    const isOut = movement?.status === "OUT";
                    const isIn = movement?.status === "IN";
                    const isPendingOut = pendingOutIds.has(asset.id);
                    const blockedReason = isAvailable ? crossBusy.get(asset.id) : undefined;

                    return (
                      <div key={asset.id}>
                        {/* Main row */}
                        <div className="grid grid-cols-[1fr_80px_80px_100px_120px] items-center px-4 py-3 hover:bg-gray-50/50 transition-colors">
                          {/* Item name */}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{asset.name}</p>
                            {asset.productCode && <p className="text-xs text-gray-400 font-mono">#{asset.productCode}</p>}
                            {!asset.allowOutside && <p className="text-xs text-amber-600">Not allowed outside</p>}
                            {blockedReason && (
                              <p className="text-xs text-red-500">
                                {blockedReason.type === "event" ? "Out to event" : "In studio booking"}: {blockedReason.name}
                              </p>
                            )}
                            {isOut && movement?.outByName && <p className="text-xs text-blue-600 mt-0.5">Issued by: {movement.outByName}</p>}
                            {isIn && (
                              <div className="mt-0.5 space-y-0.5">
                                {movement?.outByName && <p className="text-xs text-blue-500/70">Issued by: {movement.outByName}</p>}
                                {movement?.returnBy && <p className="text-xs text-green-600">Ret. by: {movement.returnBy}</p>}
                                {movement?.verifiedBy && <p className="text-xs text-teal-600">Ver. by: {movement.verifiedBy}</p>}
                              </div>
                            )}
                          </div>

                          {/* OUT column */}
                          <div className="flex justify-center">
                            {isAvailable ? (
                              blockedReason ? (
                                <span
                                  title={`${blockedReason.type === "event" ? "Out to event" : "Reserved by studio booking"}: ${blockedReason.name}`}
                                  className="w-7 h-7 rounded-full border-2 border-red-200 flex items-center justify-center opacity-60 cursor-not-allowed"
                                >
                                  <X className="w-3.5 h-3.5 text-red-400" />
                                </span>
                              ) : asset.allowOutside ? (
                                <button onClick={() => togglePendingOut(asset.id)} title={isPendingOut ? "Remove" : "Add to issue list"}
                                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${isPendingOut ? "border-orange-400 bg-orange-50" : "border-gray-300 hover:border-orange-300 hover:bg-orange-50"}`}>
                                  {isPendingOut ? <CheckCircle2 className="w-4 h-4 text-orange-500" /> : <Circle className="w-3.5 h-3.5 text-gray-400" />}
                                </button>
                              ) : (
                                <span title="Not allowed outside" className="w-7 h-7 rounded-full border-2 border-gray-200 flex items-center justify-center opacity-40 cursor-not-allowed">
                                  <Circle className="w-3.5 h-3.5 text-gray-300" />
                                </span>
                              )
                            ) : (
                              <CheckCircle2 className="w-6 h-6 text-orange-500" />
                            )}
                          </div>

                          {/* IN column */}
                          <div className="flex justify-center">
                            {isIn ? (
                              <CheckCircle2 className="w-6 h-6 text-green-500" />
                            ) : isOut ? (
                              <button onClick={() => setRow(asset.id, { inlineOpen: !inlineOpen, noteOpen: false, returnCondition: "good", returnRemarks: "" })}
                                title="Mark as returned"
                                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${inlineOpen ? "border-green-500 bg-green-50" : "border-gray-300 hover:border-green-400 hover:bg-green-50"}`}>
                                {inlineOpen ? <ChevronUp className="w-3.5 h-3.5 text-green-600" /> : <Circle className="w-3.5 h-3.5 text-gray-400" />}
                              </button>
                            ) : (
                              <span className="text-gray-200 text-xs">—</span>
                            )}
                          </div>

                          {/* Condition column */}
                          <div className="flex justify-center">
                            {isIn && movement?.condition ? (
                              <Badge variant={conditionBadge[movement.condition as ReturnCondition] || "bg-gray-100 text-gray-800"}>{movement.condition}</Badge>
                            ) : isOut ? (
                              <span className="text-xs text-gray-400">Pending</span>
                            ) : (
                              <span className="text-gray-200 text-xs">—</span>
                            )}
                          </div>

                          {/* Remarks column */}
                          <div>
                            {movement?.remarks ? (
                              <p className="text-xs text-gray-500 truncate" title={movement.remarks}>{movement.remarks}</p>
                            ) : (
                              <span className="text-gray-200 text-xs">—</span>
                            )}
                          </div>
                        </div>

                        {/* Inline return panel */}
                        {inlineOpen && isOut && (
                          <div className="mx-4 mb-3 rounded-xl border border-green-200 bg-green-50 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 gap-3">
                              <p className="text-xs text-gray-600 font-medium truncate">
                                Return <span className="font-bold">{asset.name}</span>
                              </p>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button onClick={() => setRow(asset.id, { noteOpen: !noteOpen })}
                                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors">
                                  {noteOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  {noteOpen ? "Hide details" : "Add details"}
                                </button>
                                <Button size="sm" onClick={() => returnAsset(row)} disabled={saving}>
                                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                                  {saving ? "Returning..." : "Confirm Return"}
                                </Button>
                              </div>
                            </div>

                            {noteOpen && (
                              <div className="px-4 pb-3 border-t border-green-200 pt-3 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Returned By</Label>
                                    <Input value={returnBy} onChange={(e) => setRow(asset.id, { returnBy: e.target.value })} placeholder="Person who returned..." />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Verified By</Label>
                                    <Input value={returnVerifiedBy} onChange={(e) => setRow(asset.id, { returnVerifiedBy: e.target.value })} placeholder="Person who verified..." />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Condition</Label>
                                    <Select value={returnCondition} onChange={(e) => setRow(asset.id, { returnCondition: e.target.value as ReturnCondition })}
                                      options={[{ value: "good", label: "Good" }, { value: "damaged", label: "Damaged" }, { value: "defective", label: "Defective" }, { value: "missing", label: "Missing" }]} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Remarks</Label>
                                    <Input value={returnRemarks} onChange={(e) => setRow(asset.id, { returnRemarks: e.target.value })} placeholder="Notes..." />
                                  </div>
                                </div>
                                {returnCondition !== "good" && (
                                  <div className="flex items-center gap-1.5 text-xs text-amber-700">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span>A damage report will be auto-created.</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
