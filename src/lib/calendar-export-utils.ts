import { categoryMeta, type CalendarItem } from "@/lib/calendar-utils";

// ── helpers ───────────────────────────────────────────────────────────────────
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a Date as an ICS-local datetime (floating, no timezone). */
function icsDate(date: Date, time?: string): string {
  const [h, m] = (time ?? "00:00").split(":").map(Number);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(h || 0)}${pad(m || 0)}00`;
}

/** Date-only value for all-day ICS entries (VALUE=DATE). */
function icsDateOnly(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// ── ICS export ────────────────────────────────────────────────────────────────
/** Builds an RFC-5545 .ics file from calendar items and downloads it. */
export function exportToICS(items: CalendarItem[], filename: string) {
  const now = icsDate(new Date(), `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//D4-ERP//Calendar//EN",
    "CALSCALE:GREGORIAN",
  ];

  for (const it of items) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${it.key}@d4-erp`);
    lines.push(`DTSTAMP:${now}`);
    if (it.isAllDay) {
      // All-day events use DATE values; DTEND is exclusive, so add one day.
      const endExclusive = new Date(it.end);
      endExclusive.setDate(endExclusive.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${icsDateOnly(it.start)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDateOnly(endExclusive)}`);
    } else {
      lines.push(`DTSTART:${icsDate(it.start, it.startTime)}`);
      lines.push(`DTEND:${icsDate(it.end, it.endTime ?? it.startTime)}`);
    }
    lines.push(`SUMMARY:${icsEscape(it.title)}`);
    if (it.description) lines.push(`DESCRIPTION:${icsEscape(it.description)}`);
    if (it.location) lines.push(`LOCATION:${icsEscape(it.location)}`);
    lines.push(`CATEGORIES:${icsEscape(categoryMeta(it.type).label)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  downloadBlob(blob, `${filename}.ics`);
}

// ── PDF month-grid export (lazy-load jspdf) ───────────────────────────────────
/**
 * Renders the visible month as a calendar grid PDF (mirrors the on-screen view)
 * with a category legend below.
 */
export async function exportMonthGridToPDF(
  year: number,
  month: number,
  items: CalendarItem[],
  filename: string
) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 28;
  const monthName = new Date(year, month, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  // Title
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text(monthName, margin, margin + 4);
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, pageW - margin, margin + 4, { align: "right" });

  // Grid geometry
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = firstDay + daysInMonth;
  const rows = Math.ceil(totalCells / 7);

  const gridTop = margin + 20;
  const legendH = 40;
  const gridW = pageW - margin * 2;
  const gridH = pageH - gridTop - margin - legendH;
  const cellW = gridW / 7;
  const headerH = 18;
  const cellH = (gridH - headerH) / rows;

  // Weekday header
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, gridTop, gridW, headerH, "F");
  dayNames.forEach((d, i) => {
    doc.text(d, margin + i * cellW + cellW / 2, gridTop + 12, { align: "center" });
  });

  // Cells
  doc.setDrawColor(229, 231, 235);
  for (let cell = 0; cell < rows * 7; cell++) {
    const r = Math.floor(cell / 7);
    const c = cell % 7;
    const x = margin + c * cellW;
    const y = gridTop + headerH + r * cellH;
    doc.rect(x, y, cellW, cellH);

    const dayNum = cell - firstDay + 1;
    if (dayNum < 1 || dayNum > daysInMonth) continue;

    doc.setFontSize(8);
    doc.setTextColor(55, 65, 81);
    doc.text(String(dayNum), x + 4, y + 11);

    const dayItems = items.filter((it) => {
      const ds = new Date(year, month, dayNum).getTime();
      return it.start.getTime() <= ds && it.end.getTime() >= ds;
    });

    let lineY = y + 22;
    const maxLines = Math.max(1, Math.floor((cellH - 16) / 11));
    dayItems.slice(0, maxLines).forEach((it) => {
      const meta = categoryMeta(it.type);
      const [rr, gg, bb] = hexToRgb(it.color || meta.hex);
      doc.setFillColor(rr, gg, bb);
      doc.circle(x + 6, lineY - 3, 2, "F");
      doc.setFontSize(6.5);
      doc.setTextColor(31, 41, 55);
      const label = it.title.length > 22 ? it.title.slice(0, 21) + "…" : it.title;
      doc.text(label, x + 11, lineY);
      lineY += 11;
    });
    if (dayItems.length > maxLines) {
      doc.setFontSize(6);
      doc.setTextColor(156, 163, 175);
      doc.text(`+${dayItems.length - maxLines} more`, x + 11, lineY);
    }
  }

  // Legend
  const usedTypes = Array.from(new Set(items.map((it) => it.type)));
  let lx = margin;
  const ly = gridTop + headerH + rows * cellH + 22;
  doc.setFontSize(8);
  usedTypes.forEach((t) => {
    const meta = categoryMeta(t);
    const [rr, gg, bb] = hexToRgb(meta.hex);
    doc.setFillColor(rr, gg, bb);
    doc.circle(lx + 3, ly - 3, 3, "F");
    doc.setTextColor(55, 65, 81);
    doc.text(meta.label, lx + 10, ly);
    lx += doc.getTextWidth(meta.label) + 28;
    if (lx > pageW - margin - 60) { lx = margin; }
  });

  doc.save(`${filename}.pdf`);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
