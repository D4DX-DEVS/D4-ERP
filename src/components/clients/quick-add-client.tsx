"use client";

import { useState } from "react";
import { Client } from "@/types";
import { createDocument, getDocument } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface QuickAddClientProps {
  open: boolean;
  onClose: () => void;
  /** Receives the newly created client so the caller can auto-select it. */
  onCreated: (client: Client & { id: string }) => void;
}

/**
 * Lightweight "Add New Client" modal used from the quotation/invoice screens
 * (FR-QT-001). Captures essential fields, saves to the Customer Master and
 * hands the created client back for auto-selection. Full details remain
 * editable later in the Clients module.
 */
export function QuickAddClient({ open, onClose, onCreated }: QuickAddClientProps) {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });

  const reset = () => setForm({ name: "", phone: "", email: "", address: "" });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast("error", "Client name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        companyName: form.name.trim(),
        contactPerson: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        alternatePhone: "",
        gstNumber: "",
        panNumber: "",
        address: { street: form.address.trim(), city: "", state: "", pincode: "" },
        category: "project" as Client["category"],
        notes: "",
        isActive: true,
        createdBy: user?.staffId || "",
      };
      const id = await createDocument("clients", payload);
      // Re-read so the caller gets the persisted shape (with id + timestamps).
      const created = (await getDocument<Client>("clients", id)) ?? ({ ...payload, id } as Client & { id: string });
      toast("success", "Client added");
      onCreated(created as Client & { id: string });
      reset();
      onClose();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to add client");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} className="max-w-md">
      <DialogHeader>
        <DialogTitle>Add New Client</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-2">
          <Label>Client Name *</Label>
          <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Address</Label>
          <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Add Client
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
