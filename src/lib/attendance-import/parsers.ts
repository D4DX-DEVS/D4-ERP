// ==================== Biometric attendance report parsers ====================
// Converts a biometric-device PDF export into structured per-employee,
// per-day attendance records. Text-stream order in these PDFs does not match
// visual order (rows/blocks come out scrambled), so parsing reconstructs the
// table from each text item's x/y position rather than reading stream order.
//
// New device/report format = new entry in PARSERS. Nothing else changes.

import "server-only";
import PDFParser from "pdf2json";
import type { Output, Text as PdfText } from "pdf2json";
import type { AttendanceStatus } from "@/types";

export interface ParsedDayRecord {
  date: string; // "YYYY-MM-DD"
  status: AttendanceStatus;
  rawStatus: string;
  checkIn?: string; // "HH:mm"
  checkOut?: string; // "HH:mm"
  warnings: string[];
}

export interface ParsedEmployee {
  empCode: string;
  empName: string;
  records: ParsedDayRecord[];
}

export interface ParsedImport {
  format: string;
  dateRange: { start: string; end: string }; // "YYYY-MM-DD"
  employees: ParsedEmployee[];
}

export interface AttendanceParser {
  name: string;
  detect(fullText: string): boolean;
  parse(data: Output): ParsedImport;
}

// ── Row reconstruction from positioned text items ──────────────────────────

interface Cell {
  x: number;
  text: string;
}
interface Row {
  y: number;
  cells: Cell[];
}

function textOf(t: PdfText): string {
  return t.R.map((r) => r.T).join("").trim();
}

const Y_EPSILON = 0.4;

function clusterRows(texts: PdfText[]): Row[] {
  const items = texts
    .map((t) => ({ x: t.x, y: t.y, text: textOf(t) }))
    .filter((t) => t.text.length > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const rows: Row[] = [];
  for (const item of items) {
    const last = rows[rows.length - 1];
    if (!last || Math.abs(item.y - last.y) > Y_EPSILON) {
      rows.push({ y: item.y, cells: [{ x: item.x, text: item.text }] });
    } else {
      last.cells.push({ x: item.x, text: item.text });
    }
  }
  for (const row of rows) row.cells.sort((a, b) => a.x - b.x);
  return rows;
}

/** Assigns each cell to its nearest day-column anchor by x-distance, leaving gaps blank. */
function bucketByColumn(cells: Cell[], anchors: number[]): (string | undefined)[] {
  const result: (string | undefined)[] = new Array(anchors.length).fill(undefined);
  if (cells.length === 0 || anchors.length === 0) return result;
  const gap = anchors.length > 1 ? (anchors[anchors.length - 1] - anchors[0]) / (anchors.length - 1) : Infinity;
  const maxDist = gap === Infinity ? Infinity : gap / 2 + 0.5;
  for (const cell of cells) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < anchors.length; i++) {
      const dist = Math.abs(cell.x - anchors[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestDist <= maxDist) result[bestIdx] = cell.text;
  }
  return result;
}

// ── Date helpers ────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseDateToken(mon: string, day: string, year: string): Date {
  return new Date(Number(year), MONTHS[mon.toLowerCase().slice(0, 3)] ?? 0, Number(day));
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// ── ESSL "Monthly Status Report (Basic Work Duration)" ─────────────────────

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

const STATUS_MAP: Record<string, AttendanceStatus> = {
  P: "present",
  A: "absent",
  WO: "public-holiday",
  WOP: "public-holiday",
};

const DATE_RANGE_RE = /([A-Za-z]{3})\w*\s+(\d{1,2})\s+(\d{4})\s+To\s+([A-Za-z]{3})\w*\s+(\d{1,2})\s+(\d{4})/i;
const EMP_ROW_RE = /Emp\.?\s*Code:?\s*(\S+).*?Emp\.?\s*Name:?\s*(.+)/i;

function ensureRecords(emp: ParsedEmployee, dayCount: number, start: Date) {
  if (emp.records.length === dayCount) return;
  emp.records = Array.from({ length: dayCount }, (_, i) => ({
    date: isoDate(addDays(start, i)),
    status: "absent" as AttendanceStatus,
    rawStatus: "",
    warnings: [],
  }));
}

function parseEsslBasicWorkDuration(data: Output): ParsedImport {
  let dateRangeStart: Date | null = null;
  let dateRangeEnd: Date | null = null;
  let columnAnchors: number[] = [];
  const employees: ParsedEmployee[] = [];
  let current: ParsedEmployee | null = null;

  for (const page of data.Pages) {
    for (const row of clusterRows(page.Texts)) {
      const joined = row.cells.map((c) => c.text).join(" ");
      const label = row.cells[0]?.text ?? "";

      if (!dateRangeStart && DATE_RANGE_RE.test(joined)) {
        const m = joined.match(DATE_RANGE_RE)!;
        dateRangeStart = parseDateToken(m[1], m[2], m[3]);
        dateRangeEnd = parseDateToken(m[4], m[5], m[6]);
        continue;
      }

      if (label === "Days" && columnAnchors.length === 0) {
        // Day cells are "1 W", "2 Th" etc — day number followed by a weekday abbreviation, not a bare digit.
        columnAnchors = row.cells.slice(1).filter((c) => /^\d{1,2}\b/.test(c.text)).map((c) => c.x);
        continue;
      }

      if (EMP_ROW_RE.test(joined)) {
        const m = joined.match(EMP_ROW_RE)!;
        current = { empCode: m[1].trim(), empName: m[2].trim(), records: [] };
        employees.push(current);
        continue;
      }

      if (!current || columnAnchors.length === 0) continue;

      if (label === "Status" || label === "InTime" || label === "OutTime") {
        ensureRecords(current, columnAnchors.length, dateRangeStart!);
        const values = bucketByColumn(row.cells.slice(1), columnAnchors);
        values.forEach((v, i) => {
          if (!v) return;
          if (label === "Status") current!.records[i].rawStatus = v;
          else if (label === "InTime") current!.records[i].checkIn = v;
          else current!.records[i].checkOut = v;
        });
      }
      // "Total" row skipped — workingHours is derived from checkIn/checkOut at import time.
    }
  }

  if (!dateRangeStart || !dateRangeEnd) throw new Error("Could not find the report date range.");
  if (columnAnchors.length === 0) throw new Error("Could not find the day-column header.");

  for (const emp of employees) {
    for (const rec of emp.records) {
      const mapped = STATUS_MAP[rec.rawStatus];
      if (!mapped) rec.warnings.push(`Unknown status code "${rec.rawStatus}"`);
      rec.status = mapped ?? "absent";

      if (rec.checkIn && !TIME_RE.test(rec.checkIn)) {
        rec.warnings.push(`Invalid check-in time "${rec.checkIn}"`);
        rec.checkIn = undefined;
      }
      if (rec.checkOut && !TIME_RE.test(rec.checkOut)) {
        rec.warnings.push(`Invalid check-out time "${rec.checkOut}"`);
        rec.checkOut = undefined;
      }
      if (rec.checkIn && rec.checkOut && rec.checkOut < rec.checkIn) {
        rec.warnings.push("Check-out is earlier than check-in — treated as an overnight shift rolling into the next day");
      }
    }
  }

  return {
    format: "essl-basic-work-duration",
    dateRange: { start: isoDate(dateRangeStart), end: isoDate(dateRangeEnd) },
    employees,
  };
}

// ── Registry ────────────────────────────────────────────────────────────────

const PARSERS: AttendanceParser[] = [
  {
    name: "essl-basic-work-duration",
    detect: (text) => /Basic Work Duration/i.test(text),
    parse: parseEsslBasicWorkDuration,
  },
];

export async function parseAttendancePdf(buffer: Buffer): Promise<ParsedImport> {
  const data = await new Promise<Output>((resolve, reject) => {
    const parser = new PDFParser();
    parser.on("pdfParser_dataError", (err) => {
      reject(err instanceof Error ? err : new Error(String((err as { parserError?: unknown }).parserError ?? "PDF parse failed")));
    });
    parser.on("pdfParser_dataReady", (pdfData) => resolve(pdfData));
    parser.parseBuffer(buffer);
  });

  const fullText = data.Pages.flatMap((p) => p.Texts.map(textOf)).join(" ");
  const matched = PARSERS.find((p) => p.detect(fullText));
  if (!matched) throw new Error("Unsupported attendance report format.");
  return matched.parse(data);
}
