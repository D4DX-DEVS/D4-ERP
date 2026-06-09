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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
          <Button
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
          >
            <Plus className="h-4 w-4" /> Add {tab === "studios" ? "Studio" : "Equipment"}
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200/70">
        {(["studios", "equipment"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 transition-colors ${
              tab === t ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : tab === "studios" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {studios.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-slate-900">{s.name}</h4>
                  {s.location && <p className="text-xs text-slate-500">{s.location}</p>}
                  {s.capacity && <p className="text-xs text-slate-500">Capacity: {s.capacity}</p>}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
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
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget({ type: "studio", id: s.id! })}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
              {s.facilities && s.facilities.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.facilities.map((f) => (
                    <span key={f} className="text-[10px] rounded-full bg-teal-50 text-teal-700 px-2 py-0.5 font-medium">{f}</span>
                  ))}
                </div>
              )}
              <div className="mt-3">
                <Badge variant={s.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}>
                  {s.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Studio</TableHead>
              <TableHead>Available</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {equipment.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-slate-500">No equipment added.</TableCell></TableRow>
            ) : (
              equipment.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-semibold text-slate-900">{e.name}</TableCell>
                  <TableCell>{e.category || "—"}</TableCell>
                  <TableCell>{studios.find((s) => s.id === e.studioId)?.name || "Any"}</TableCell>
                  <TableCell>
                    <Badge variant={e.isAvailable ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                      {e.isAvailable ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit"
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
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => setDeleteTarget({ type: "equipment", id: e.id! })}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {/* Studio Dialog */}
      <Dialog open={studioDialog} onClose={() => setStudioDialog(false)} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editStudioId ? "Edit Studio" : "Add Studio"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={studioForm.name} onChange={(e) => setStudioForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Input value={studioForm.location} onChange={(e) => setStudioForm((p) => ({ ...p, location: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Capacity</Label>
            <Input type="number" min={0} value={studioForm.capacity} onChange={(e) => setStudioForm((p) => ({ ...p, capacity: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Facilities (comma-separated)</Label>
            <Input value={studioForm.facilities} onChange={(e) => setStudioForm((p) => ({ ...p, facilities: e.target.value }))} placeholder="WiFi, AC, Green Screen" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="outline" onClick={() => setStudioDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveStudio}>Save</Button>
        </div>
      </Dialog>

      {/* Equipment Dialog */}
      <Dialog open={eqDialog} onClose={() => setEqDialog(false)} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editEqId ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={eqForm.name} onChange={(e) => setEqForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Input value={eqForm.category} onChange={(e) => setEqForm((p) => ({ ...p, category: e.target.value }))} placeholder="Camera, Light, Audio..." />
          </div>
          <div className="space-y-2">
            <Label>Studio</Label>
            <Select
              value={eqForm.studioId}
              onChange={(e) => setEqForm((p) => ({ ...p, studioId: e.target.value }))}
              placeholder="Any studio"
              options={[
                { value: "", label: "Any studio" },
                ...studios.map((s) => ({ value: s.id!, label: s.name })),
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={eqForm.description} onChange={(e) => setEqForm((p) => ({ ...p, description: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="outline" onClick={() => setEqDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveEquipment}>Save</Button>
        </div>
      </Dialog>

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
