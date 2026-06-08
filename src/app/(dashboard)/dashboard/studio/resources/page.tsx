"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  Timestamp,
} from "@/lib/firestore";

import { useToast } from "@/components/ui/toast";
import { ListingHeader } from "@/components/ui/listing";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Studio, StudioEquipment } from "@/types";

type Tab = "studios" | "equipment";

export default function StudioResourcesPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("studios");
  const [studios, setStudios] = useState<Studio[]>([]);
  const [equipment, setEquipment] = useState<StudioEquipment[]>([]);
  const [loading, setLoading] = useState(true);

  // Studio form
  const [studioDialog, setStudioDialog] = useState(false);
  const [editStudioId, setEditStudioId] = useState<string | null>(null);
  const [studioForm, setStudioForm] = useState({ name: "", location: "", capacity: "", description: "", facilities: "" });

  // Equipment form
  const [eqDialog, setEqDialog] = useState(false);
  const [editEqId, setEditEqId] = useState<string | null>(null);
  const [eqForm, setEqForm] = useState({ name: "", description: "", category: "", studioId: "" });

  const [deleteTarget, setDeleteTarget] = useState<{ type: "studio" | "equipment"; id: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [s, e] = await Promise.all([
          getDocuments<Studio>("studios", []),
          getDocuments<StudioEquipment>("studio_equipment", []),
        ]);
        setStudios(s);
        setEquipment(e);
      } catch (error) {
        console.error("Fetch failed:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fetchData = async () => {
    try {
      const [s, e] = await Promise.all([
        getDocuments<Studio>("studios", []),
        getDocuments<StudioEquipment>("studio_equipment", []),
      ]);
      setStudios(s);
      setEquipment(e);
    } catch (error) {
      console.error("Fetch failed:", error);
    }
  };

  // Studio CRUD
  const handleSaveStudio = async () => {
    if (!studioForm.name.trim()) { toast("error", "Name is required"); return; }
    try {
      if (editStudioId) {
        await updateDocument("studios", editStudioId, {
          name: studioForm.name.trim(),
          location: studioForm.location.trim(),
          capacity: studioForm.capacity ? Number(studioForm.capacity) : null,
          description: studioForm.description.trim(),
          facilities: studioForm.facilities ? studioForm.facilities.split(",").map((f) => f.trim()) : [],
          updatedAt: Timestamp.now(),
        });
        toast("success", "Studio updated");
      } else {
        await createDocument("studios", {
          name: studioForm.name.trim(),
          location: studioForm.location.trim(),
          capacity: studioForm.capacity ? Number(studioForm.capacity) : null,
          description: studioForm.description.trim(),
          facilities: studioForm.facilities ? studioForm.facilities.split(",").map((f) => f.trim()) : [],
          isActive: true,
          createdAt: Timestamp.now(),
        });
        toast("success", "Studio created");
      }
      setStudioDialog(false);
      setEditStudioId(null);
      await fetchData();
    } catch { toast("error", "Save failed"); }
  };

  const handleSaveEquipment = async () => {
    if (!eqForm.name.trim()) { toast("error", "Name is required"); return; }
    try {
      if (editEqId) {
        await updateDocument("studio_equipment", editEqId, {
          name: eqForm.name.trim(),
          description: eqForm.description.trim(),
          category: eqForm.category.trim(),
          studioId: eqForm.studioId || null,
          updatedAt: Timestamp.now(),
        });
        toast("success", "Equipment updated");
      } else {
        await createDocument("studio_equipment", {
          name: eqForm.name.trim(),
          description: eqForm.description.trim(),
          category: eqForm.category.trim(),
          studioId: eqForm.studioId || null,
          isAvailable: true,
          createdAt: Timestamp.now(),
        });
        toast("success", "Equipment added");
      }
      setEqDialog(false);
      setEditEqId(null);
      await fetchData();
    } catch { toast("error", "Save failed"); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const collection = deleteTarget.type === "studio" ? "studios" : "studio_equipment";
      await deleteDocument(collection, deleteTarget.id);
      toast("success", `${deleteTarget.type === "studio" ? "Studio" : "Equipment"} deleted`);
      setDeleteTarget(null);
      await fetchData();
    } catch { toast("error", "Delete failed"); }
  };

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Studio Resources"
        description="Manage studios and equipment."
        action={
          <button
            onClick={() => {
              if (tab === "studios") {
                setStudioForm({ name: "", location: "", capacity: "", description: "", facilities: "" });
                setEditStudioId(null);
                setStudioDialog(true);
              } else {
                setEqForm({ name: "", description: "", category: "", studioId: "" });
                setEditEqId(null);
                setEqDialog(true);
              }
            }}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Add {tab === "studios" ? "Studio" : "Equipment"}
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["studios", "equipment"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : tab === "studios" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {studios.map((s) => (
            <div key={s.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium">{s.name}</h4>
                  {s.location && <p className="text-xs text-muted-foreground">{s.location}</p>}
                  {s.capacity && <p className="text-xs text-muted-foreground">Capacity: {s.capacity}</p>}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setStudioForm({
                        name: s.name,
                        location: s.location || "",
                        capacity: s.capacity?.toString() || "",
                        description: s.description || "",
                        facilities: s.facilities?.join(", ") || "",
                      });
                      setEditStudioId(s.id!);
                      setStudioDialog(true);
                    }}
                    className="rounded p-1 hover:bg-accent"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget({ type: "studio", id: s.id! })}
                    className="rounded p-1 hover:bg-destructive/10 text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {s.facilities && s.facilities.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.facilities.map((f) => (
                    <span key={f} className="text-[10px] rounded bg-accent px-1.5 py-0.5">{f}</span>
                  ))}
                </div>
              )}
              <div className="mt-2">
                <span className={`text-xs rounded-full px-2 py-0.5 ${s.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                  {s.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Studio</th>
                <th className="text-left px-4 py-3 font-medium">Available</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {equipment.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No equipment added.</td></tr>
              ) : (
                equipment.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{e.name}</td>
                    <td className="px-4 py-3">{e.category || "—"}</td>
                    <td className="px-4 py-3">{studios.find((s) => s.id === e.studioId)?.name || "Any"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs rounded-full px-2 py-0.5 ${e.isAvailable ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {e.isAvailable ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setEqForm({
                            name: e.name,
                            description: e.description || "",
                            category: e.category || "",
                            studioId: e.studioId || "",
                          });
                          setEditEqId(e.id!);
                          setEqDialog(true);
                        }}
                        className="rounded px-2 py-1 text-xs text-primary hover:bg-accent"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ type: "equipment", id: e.id! })}
                        className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Studio Dialog */}
      {studioDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-xl shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">{editStudioId ? "Edit Studio" : "Add Studio"}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Name *</label>
                <input value={studioForm.name} onChange={(e) => setStudioForm((p) => ({ ...p, name: e.target.value }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Location</label>
                <input value={studioForm.location} onChange={(e) => setStudioForm((p) => ({ ...p, location: e.target.value }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Capacity</label>
                <input type="number" value={studioForm.capacity} onChange={(e) => setStudioForm((p) => ({ ...p, capacity: e.target.value }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Facilities (comma-separated)</label>
                <input value={studioForm.facilities} onChange={(e) => setStudioForm((p) => ({ ...p, facilities: e.target.value }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="WiFi, AC, Green Screen" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setStudioDialog(false)} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</button>
              <button onClick={handleSaveStudio} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Equipment Dialog */}
      {eqDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-xl shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">{editEqId ? "Edit Equipment" : "Add Equipment"}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Name *</label>
                <input value={eqForm.name} onChange={(e) => setEqForm((p) => ({ ...p, name: e.target.value }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Category</label>
                <input value={eqForm.category} onChange={(e) => setEqForm((p) => ({ ...p, category: e.target.value }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Camera, Light, Audio..." />
              </div>
              <div>
                <label className="text-sm font-medium">Studio</label>
                <select value={eqForm.studioId} onChange={(e) => setEqForm((p) => ({ ...p, studioId: e.target.value }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Any studio</option>
                  {studios.map((s) => (<option key={s.id} value={s.id!}>{s.name}</option>))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <input value={eqForm.description} onChange={(e) => setEqForm((p) => ({ ...p, description: e.target.value }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEqDialog(false)} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</button>
              <button onClick={handleSaveEquipment} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">Save</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete ${deleteTarget?.type === "studio" ? "Studio" : "Equipment"}`}
        message="Are you sure? This cannot be undone."
        variant="danger"
      />
    </div>
  );
}
