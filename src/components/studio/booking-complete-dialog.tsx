"use client";

import { useEffect, useState } from "react";
import { Camera, CreditCard, Loader2 } from "lucide-react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StaffPicker } from "@/components/studio/staff-picker";
import type { BookingCrewMember, Staff, StudioBooking } from "@/types";

export interface BookingCompleteDialogProps {
  booking: (StudioBooking & { id: string }) | null;
  staff: (Staff & { id: string })[];
  saving?: boolean;
  onClose: () => void;
  /** Both fields are optional — an empty submit still completes the booking. */
  onConfirm: (crew: { shooters: BookingCrewMember[]; cardHolder: BookingCrewMember | null }) => void;
}

/**
 * Asked on the way to "completed": who shot the job, and who walked away with
 * the memory card. Prefills from whatever was captured before (re-completing an
 * already-completed booking) or from the booking's assigned staff.
 */
export function BookingCompleteDialog({
  booking,
  staff,
  saving = false,
  onClose,
  onConfirm,
}: BookingCompleteDialogProps) {
  const [shooters, setShooters] = useState<BookingCrewMember[]>([]);
  const [cardHolder, setCardHolder] = useState<BookingCrewMember[]>([]);

  // Reset per booking so a previous booking's crew never leaks into the next.
  useEffect(() => {
    if (!booking) return;
    const existingShooters = booking.completion?.shooters;
    const assigned = (booking.assignedStaff || []).map((s) => ({ staffId: s.staffId, name: s.staffName }));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShooters(existingShooters?.length ? existingShooters : assigned);
     
    setCardHolder(booking.completion?.cardHolder ? [booking.completion.cardHolder] : []);
  }, [booking]);

  if (!booking) return null;

  return (
    <Dialog open={!!booking} onClose={onClose} className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Complete booking</DialogTitle>
        <DialogDescription>
          {booking.studioName || booking.studioId} · {booking.date} · {booking.startTime}–{booking.endTime}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="booking-shooters" className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-slate-400" />
            Who shot it?
            <span className="text-xs font-normal text-slate-400">optional</span>
          </Label>
          <StaffPicker
            id="booking-shooters"
            staff={staff}
            value={shooters}
            onChange={setShooters}
            multiple
            placeholder="Search staff or type a name…"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="booking-card-holder" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-slate-400" />
            Who has the card?
            <span className="text-xs font-normal text-slate-400">optional</span>
          </Label>
          <StaffPicker
            id="booking-card-holder"
            staff={staff}
            value={cardHolder}
            onChange={setCardHolder}
            placeholder="Search staff or type a name…"
          />
          <p className="text-xs text-slate-400">
            The person holding the memory card until the footage is handed over.
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm({ shooters, cardHolder: cardHolder[0] ?? null })}
          disabled={saving}
          className="gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Mark completed
        </Button>
      </div>
    </Dialog>
  );
}
