import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { effectiveSubject } from "@/lib/effective-grants";
import { hasFeature } from "@/lib/permissions";
import type { ParsedEmployee } from "@/lib/attendance-import/parsers";
import type { AttendanceStatus } from "@/types";
import { normalizeSettings, isNonWorkingDay, evaluateCheckIn, type AppSettings } from "@/lib/settings";
import { DEFAULT_TIME_ZONE, hoursBetween, zonedDateAt } from "@/lib/tz";

interface ParsedRecord {
  date: string;
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
}

interface ConfirmBody {
  fileUrl: string;
  fileName: string;
  format: string;
  dateRange: { start: string; end: string };
  employees: (Omit<ParsedEmployee, "records"> & { records: ParsedRecord[] })[];
  mappings?: Record<string, string>;
  overwriteExisting?: boolean;
}

function dateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
/**
 * The same punch expressed in the HOST's clock.
 *
 * Only for schedule maths: evaluateCheckIn compares `when.getHours()` against
 * "09:30", so it needs a Date whose local fields are the wall clock the device
 * printed. The value that gets STORED is the zone-correct instant instead.
 */
function hostWallClock(iso: string, time?: string): Date | undefined {
  if (!time) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  if ([y, m, d, h, min].some((n) => Number.isNaN(n))) return undefined;
  return new Date(y, m - 1, d, h, min, 0, 0);
}

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  // Fresh grants, not the login-time JWT snapshot — see effective-grants.ts
  if (!hasFeature(await effectiveSubject(user), "attendance-import")) {
    return NextResponse.json({ error: "You do not have permission to import attendance." }, { status: 403 });
  }

  const body = (await req.json()) as ConfirmBody;
  const { fileUrl, fileName, format, dateRange, employees, mappings = {}, overwriteExisting = false } = body;
  if (!fileUrl || !dateRange?.start || !dateRange?.end || !Array.isArray(employees)) {
    return NextResponse.json({ error: "Invalid import payload" }, { status: 400 });
  }

  await connectDB();
  const Staff = getModel("staff");
  const Attendance = getModel("attendance");
  const Batch = getModel("attendance_imports");

  // ESSL PDFs mark punch-less off days "A" — normalize to week-off using configured weekly schedule/holidays
  let settings: AppSettings;
  try {
    const Settings = getModel("settings");
    const raw = (await Settings.findOne({}).lean()) as Partial<AppSettings> | null;
    settings = normalizeSettings(raw);
  } catch {
    settings = normalizeSettings(null);
  }
  // The device prints the office wall clock and nothing else. Reading "09:54"
  // with the host's zone stored 09:54 UTC on Vercel, which every viewer in
  // India then read as a 03:24 pm check-in.
  const timeZone = settings.timezone || DEFAULT_TIME_ZONE;

  // Removed staff (soft-deleted) are excluded — their rows stay for history but
  // they take no new punches; the device code lands in unmappedCount instead.
  const staffDocs = (await Staff.find({ isDeleted: { $ne: true } }, { biometricId: 1, employeeCode: 1, companyId: 1 }).lean()) as unknown as {
    _id: unknown;
    biometricId?: string;
    employeeCode?: string;
    companyId?: string;
  }[];
  const byBiometricId = new Map<string, string>();
  const byEmployeeCode = new Map<string, string>();
  const companyByStaffId = new Map<string, string | undefined>();
  for (const s of staffDocs) {
    const id = String(s._id);
    if (s.biometricId) byBiometricId.set(s.biometricId, id);
    if (s.employeeCode) byEmployeeCode.set(s.employeeCode, id);
    companyByStaffId.set(id, s.companyId);
  }

  const batchDoc = await Batch.create({
    uploadedBy: user.uid,
    uploadedByName: user.name || user.email || "Unknown",
    fileName,
    fileUrl,
    format,
    dateRange: { start: dateOnly(dateRange.start), end: dateOnly(dateRange.end) },
    summary: { totalRecords: 0, createdCount: 0, updatedCount: 0, skippedCount: 0, unmappedCount: 0, errorCount: 0 },
    status: "completed",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const batchId = batchDoc._id.toString();

  let totalRecords = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let unmappedCount = 0;
  let errorCount = 0;

  for (const emp of employees) {
    totalRecords += emp.records.length;

    const manualStaffId = mappings[emp.empCode];
    const staffId = manualStaffId || byBiometricId.get(emp.empCode) || byEmployeeCode.get(emp.empCode);

    if (!staffId) {
      unmappedCount += emp.records.length;
      continue;
    }

    if (manualStaffId && !byBiometricId.has(emp.empCode)) {
      try {
        await Staff.findByIdAndUpdate(manualStaffId, { $set: { biometricId: emp.empCode, updatedAt: new Date() } });
      } catch {
        // Best-effort — the mapping still applies to this import even if the save fails.
      }
    }

    const companyId = companyByStaffId.get(staffId);

    for (const rec of emp.records) {
      try {
        const date = dateOnly(rec.date);
        if (rec.status === "absent" && !rec.checkIn && !rec.checkOut && isNonWorkingDay(settings, date, companyId)) {
          rec.status = "week-off";
        }
        const checkIn = zonedDateAt(rec.date, rec.checkIn, timeZone);
        let checkOut = zonedDateAt(rec.date, rec.checkOut, timeZone);
        if (checkIn && checkOut && checkOut < checkIn) {
          // Overnight shift — the punch landed after midnight, so it belongs to the next calendar day.
          checkOut = new Date(checkOut.getTime() + 86400000);
        }

        // Late flag mirrors the manual register edit: schedule + grace, off days never late.
        const punchWallClock = hostWallClock(rec.date, rec.checkIn);
        const isLate = punchWallClock
          ? evaluateCheckIn(settings, punchWallClock, null, companyId).isLate
          : false;

        // Same staff+day rows can carry different midnight conventions (see
        // attendance-dedupe.ts), so match the whole local day, not one exact Date.
        const existing = (await Attendance.findOne({
          staffId,
          date: { $gte: date, $lt: new Date(date.getTime() + 86400000) },
          isDeleted: { $ne: true },
        }).lean()) as { _id: unknown } | null;

        if (existing && !overwriteExisting) {
          skippedCount += 1;
          continue;
        }

        const data: Record<string, unknown> = {
          staffId,
          date,
          checkIn,
          checkOut,
          status: rec.status,
          workingHours: hoursBetween(checkIn, checkOut),
          overtimeHours: 0,
          isLate,
          isEarlyDeparture: false,
          source: "biometric",
          // Stamps the row as already anchored to the office clock. The
          // migration that repaired the pre-fix imports skips stamped rows, so
          // re-running it can never shift a punch this importer wrote.
          punchTimeZone: timeZone,
          importBatchId: batchId,
          remarks: "rawStatus" in rec && rec.rawStatus && rec.rawStatus !== "P" && rec.rawStatus !== "A" ? `ESSL status: ${rec.rawStatus}` : undefined,
          updatedAt: new Date(),
        };

        if (existing) {
          await Attendance.findByIdAndUpdate(existing._id, { $set: data });
          updatedCount += 1;
        } else {
          data.createdAt = new Date();
          await Attendance.create(data);
          createdCount += 1;
        }
      } catch (error) {
        console.error("Attendance import row error:", error);
        errorCount += 1;
      }
    }
  }

  const summary = { totalRecords, createdCount, updatedCount, skippedCount, unmappedCount, errorCount };
  await Batch.findByIdAndUpdate(batchId, { $set: { summary, updatedAt: new Date() } });

  return NextResponse.json({ batchId, summary });
}
