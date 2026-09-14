"use client";

import { Camera, CreditCard, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusTimeline } from "@/components/ui/status-timeline";
import { studioStatusBadge } from "@/lib/studio-utils";
import { formatCrewNames, sanitizeCrew, sanitizeCrewMember } from "@/lib/studio-crew";
import type { StudioBooking } from "@/types";

export interface BookingViewDialogProps {
  booking: (StudioBooking & { id: string }) | null;
  onClose: () => void;
  onEdit: (booking: StudioBooking & { id: string }) => void;
  onDelete: (bookingId: string) => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="text-sm text-slate-800">{value || "—"}</p>
    </div>
  );
}

function formatMinutes(minutes?: number): string {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

function formatStamp(ts?: { seconds: number }): string {
  if (!ts?.seconds) return "—";
  return new Date(ts.seconds * 1000).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Read-only detail for one booking, opened by clicking its row. */
export function BookingViewDialog({ booking, onClose, onEdit, onDelete }: BookingViewDialogProps) {
  if (!booking) return null;

  const shooters = sanitizeCrew(booking.completion?.shooters);
  const cardHolder = sanitizeCrewMember(booking.completion?.cardHolder);
  const reserved = booking.reservedItems || [];
  const assigned = booking.assignedStaff || [];

  return (
    <Dialog open={!!booking} onClose={onClose} className="max-w-2xl">
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{booking.purpose || "Studio booking"}</DialogTitle>
          <Badge variant={studioStatusBadge(booking.status)} className="capitalize">
            {booking.status}
          </Badge>
        </div>
        <DialogDescription>
          {booking.bookingId ? `${booking.bookingId} · ` : ""}
          {booking.studioName || booking.studioId}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Date" value={booking.date} />
          <Field label="Time" value={`${booking.startTime} – ${booking.endTime}`} />
          <Field label="Duration" value={formatMinutes(booking.duration)} />
          <Field label="Type" value={<span className="capitalize">{booking.bookingType || "—"}</span>} />
          <Field label="Client" value={booking.clientName} />
          <Field label="Company" value={booking.companyName} />
          <Field label="Contact" value={booking.contactNumber} />
          <Field label="Email" value={booking.email} />
          <Field label="Event" value={booking.eventName} />
        </section>

        {booking.notes && (
          <section>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Notes</p>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{booking.notes}</p>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Crew</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <Camera className="mt-0.5 h-4 w-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Shot by</p>
                <p className="text-sm text-slate-800">{formatCrewNames(shooters)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CreditCard className="mt-0.5 h-4 w-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Card with</p>
                <p className="text-sm text-slate-800">{cardHolder?.name || "—"}</p>
              </div>
            </div>
          </div>
          {booking.completion && (
            <p className="mt-3 text-xs text-slate-400">
              Completed {formatStamp(booking.completion.completedAt)}
              {booking.completion.completedByName ? ` by ${booking.completion.completedByName}` : ""}
            </p>
          )}
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Reserved items
            </p>
            {reserved.length === 0 ? (
              <p className="text-sm text-slate-400">None</p>
            ) : (
              <ul className="space-y-1">
                {reserved.map((item) => (
                  <li key={`${item.kind}-${item.itemId}`} className="text-sm text-slate-700">
                    {item.name}
                    <span className="ml-1 text-xs text-slate-400">({item.kind})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Assigned staff
            </p>
            {assigned.length === 0 ? (
              <p className="text-sm text-slate-400">None</p>
            ) : (
              <ul className="space-y-1">
                {assigned.map((s) => (
                  <li key={s.staffId} className="text-sm text-slate-700">
                    {s.staffName}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Requested by" value={booking.requestedByName} />
          <Field label="Approved by" value={booking.approvedByName} />
          <Field label="Approved on" value={formatStamp(booking.approvalDate)} />
          {booking.rejectionReason && <Field label="Rejection reason" value={booking.rejectionReason} />}
        </section>

        {!!booking.statusHistory?.length && (
          <section>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Status history
            </p>
            <StatusTimeline history={booking.statusHistory} />
          </section>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-slate-200/80 pt-4">
        <Button
          variant="outline"
          className="gap-2 text-red-600"
          onClick={() => onDelete(booking.id)}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
        <Button className="gap-2" onClick={() => onEdit(booking)}>
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      </div>
    </Dialog>
  );
}
