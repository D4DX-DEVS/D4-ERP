// D4Media monthly attendance sheet export — replicates the org's printed
// "D4 ATTENDANCE SHEET" layout: NO / NAME / EMP CODE / DEPT plus one column per
// day (weekday row over date row), staff grouped PERMANENT then CONTRACT, and
// status codes colored to match the on-screen monthly grid.
import type { EmploymentType } from "@/types";

export interface SheetDay {
  day: number;
  /** Uppercase 3-letter weekday, e.g. "SAT". */
  weekday: string;
  isOff: boolean;
  isHoliday: boolean;
}

export interface SheetCell {
  code: string;
  /** Tailwind cell classes from the attendance status config; keys CELL_COLORS. */
  cell: string;
}

export interface SheetStaffEntry {
  name: string;
  empCode: string;
  dept: string;
  employmentType?: EmploymentType;
  /** One slot per day of the month; null = no mark (future / before joining). */
  cells: (SheetCell | null)[];
}

export interface SheetSection {
  title: "PERMANENT" | "CONTRACT";
  rows: SheetStaffEntry[];
}

export function groupStaffForSheet(entries: SheetStaffEntry[]): SheetSection[] {
  const byCode = (a: SheetStaffEntry, b: SheetStaffEntry) =>
    a.empCode.localeCompare(b.empCode, undefined, { numeric: true });
  const permanent = entries.filter((e) => (e.employmentType ?? "permanent") === "permanent");
  const contract = entries.filter((e) => (e.employmentType ?? "permanent") !== "permanent");
  const sections: SheetSection[] = [];
  if (permanent.length) sections.push({ title: "PERMANENT", rows: [...permanent].sort(byCode) });
  if (contract.length) sections.push({ title: "CONTRACT", rows: [...contract].sort(byCode) });
  return sections;
}

type RGB = [number, number, number];

// Tailwind 100-shade fills with 700-shade text, mirroring ATTENDANCE_STATUS_CONFIG.
const CELL_COLORS: Record<string, { fill: RGB; text: RGB }> = {
  "bg-emerald-100 text-emerald-700": { fill: [209, 250, 229], text: [4, 120, 87] },
  "bg-rose-100 text-rose-700": { fill: [255, 228, 230], text: [190, 18, 60] },
  "bg-rose-100 text-rose-500": { fill: [255, 228, 230], text: [244, 63, 94] },
  "bg-amber-100 text-amber-700": { fill: [254, 243, 199], text: [180, 83, 9] },
  "bg-violet-100 text-violet-700": { fill: [237, 233, 254], text: [109, 40, 217] },
  "bg-purple-100 text-purple-700": { fill: [243, 232, 255], text: [126, 34, 206] },
  "bg-slate-100 text-slate-400": { fill: [241, 245, 249], text: [100, 116, 139] },
  "bg-orange-100 text-orange-700": { fill: [255, 237, 213], text: [194, 65, 12] },
  "bg-cyan-100 text-cyan-700": { fill: [207, 250, 254], text: [14, 116, 144] },
  "bg-teal-100 text-teal-700": { fill: [204, 251, 241], text: [15, 118, 110] },
  "bg-pink-100 text-pink-700": { fill: [252, 231, 243], text: [190, 24, 93] },
  "bg-indigo-100 text-indigo-700": { fill: [224, 231, 255], text: [67, 56, 202] },
};

const INFO_COLUMNS = 4;

export interface AttendanceSheetOptions {
  /** e.g. "August 2026" — printed under the title. */
  monthLabel: string;
  days: SheetDay[];
  sections: SheetSection[];
  legend?: { code: string; label: string }[];
  /** Saved as `${filename}.pdf`. */
  filename: string;
}

export async function exportAttendanceSheetPDF(opts: AttendanceSheetOptions): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("D4Media Attendance Sheet", pageWidth / 2, 10, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(opts.monthLabel.toUpperCase(), pageWidth / 2, 15, { align: "center" });

  const head = [
    [
      ...["NO", "NAME", "EMP CODE", "DEPT"].map((content) => ({ content, rowSpan: 2 })),
      ...opts.days.map((d) => ({ content: d.weekday })),
    ],
    opts.days.map((d) => ({ content: String(d.day).padStart(2, "0") })),
  ];

  type BodyCell = string | { content: string; colSpan: number; styles: Record<string, unknown> };
  const body: BodyCell[][] = [];
  // Day-cell colors keyed "rowIndex:columnIndex" — applied in didParseCell.
  const cellColors = new Map<string, { fill: RGB; text: RGB }>();
  let no = 0;
  for (const section of opts.sections) {
    body.push([
      {
        content: section.title,
        colSpan: INFO_COLUMNS + opts.days.length,
        styles: {
          halign: "left",
          fontStyle: "bold",
          fillColor: [226, 232, 240],
          textColor: [51, 65, 85],
        },
      },
    ]);
    for (const row of section.rows) {
      no += 1;
      const rowIndex = body.length;
      row.cells.forEach((cell, i) => {
        const colors = cell && CELL_COLORS[cell.cell];
        if (colors) cellColors.set(`${rowIndex}:${INFO_COLUMNS + i}`, colors);
      });
      body.push([
        String(no),
        row.name.toUpperCase(),
        row.empCode,
        row.dept.toUpperCase(),
        ...row.cells.map((c) => c?.code ?? ""),
      ]);
    }
  }

  autoTable(doc, {
    head,
    body,
    startY: 18,
    margin: { left: 6, right: 6, top: 18 },
    theme: "grid",
    styles: {
      fontSize: 5.5,
      cellPadding: 0.7,
      halign: "center",
      valign: "middle",
      lineColor: [203, 213, 225],
      lineWidth: 0.1,
      overflow: "hidden",
      textColor: [15, 23, 42],
    },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 7 },
      1: { cellWidth: 34, halign: "left", overflow: "linebreak" },
      2: { cellWidth: 15 },
      3: { cellWidth: 24, halign: "left", overflow: "linebreak", fontSize: 4.8 },
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= INFO_COLUMNS) {
        const d = opts.days[data.column.index - INFO_COLUMNS];
        if (d && (d.isHoliday || d.isOff)) data.cell.styles.textColor = [225, 29, 72];
      }
      if (data.section === "body") {
        const colors = cellColors.get(`${data.row.index}:${data.column.index}`);
        if (colors) {
          data.cell.styles.fillColor = colors.fill;
          data.cell.styles.textColor = colors.text;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  if (opts.legend?.length) {
    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 18;
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(
      opts.legend.map((l) => `${l.code} = ${l.label}`).join("    "),
      6,
      Math.min(finalY + 5, doc.internal.pageSize.getHeight() - 5)
    );
  }

  doc.save(`${opts.filename}.pdf`);
}
