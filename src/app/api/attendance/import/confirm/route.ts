import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { hasFeature } from "@/lib/permissions";
import type { ParsedEmployee } from "@/lib/attendance-import/parsers";
import type { AttendanceStatus } from "@/types";

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
function dateAt(iso: string, time?: string): Date | undefined {
  if (!time) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
}
function workingHoursOf(checkIn?: Date, checkOut?: Date): number {
  if (!checkIn || !checkOut) return 0;
  const hrs = (checkOut.getTime() - checkIn.getTime()) / 3600000;
  return hrs > 0 ? Math.round(hrs * 100) / 100 : 0;
}

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasFeature({ role: user.role, grantedFeatures: user.features }, "attendance-import")) {
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

  const staffDocs = (await Staff.find({}, { biometricId: 1, employeeCode: 1 }).lean()) as unknown as {
    _id: unknown;
    biometricId?: string;
    employeeCode?: string;
  }[];
  const byBiometricId = new Map<string, string>();
  const byEmployeeCode = new Map<string, string>();
  for (const s of staffDocs) {
    const id = String(s._id);
    if (s.biometricId) byBiometricId.set(s.biometricId, id);
    if (s.employeeCode) byEmployeeCode.set(s.employeeCode, id);
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

    for (const rec of emp.records) {
      try {
        const date = dateOnly(rec.date);
        const checkIn = dateAt(rec.date, rec.checkIn);
        let checkOut = dateAt(rec.date, rec.checkOut);
        if (checkIn && checkOut && checkOut < checkIn) {
          // Overnight shift — the punch landed after midnight, so it belongs to the next calendar day.
          checkOut = new Date(checkOut.getTime() + 86400000);
        }

        const existing = (await Attendance.findOne({ staffId, date, isDeleted: { $ne: true } }).lean()) as { _id: unknown } | null;

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
          workingHours: workingHoursOf(checkIn, checkOut),
          overtimeHours: 0,
          isLate: false,
          isEarlyDeparture: false,
          source: "biometric",
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
