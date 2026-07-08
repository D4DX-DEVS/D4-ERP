import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { hasFeature } from "@/lib/permissions";
import { isStorageConfigured, uploadToSpaces } from "@/lib/storage";
import { parseAttendancePdf } from "@/lib/attendance-import/parsers";

const MAX_BYTES = 15 * 1024 * 1024;

export interface StaffMatch {
  staffId: string;
  matchedBy: "biometricId" | "employeeCode";
}

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasFeature({ role: user.role, grantedFeatures: user.features }, "attendance-import")) {
    return NextResponse.json({ error: "You do not have permission to import attendance." }, { status: 403 });
  }
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "File storage is not configured on the server." }, { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds the 15 MB limit" }, { status: 413 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF reports are supported" }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseAttendancePdf(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not parse this PDF.";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  let fileUrl: string;
  try {
    const uploaded = await uploadToSpaces({ buffer, contentType: file.type, folder: "attendance-imports", originalName: file.name });
    fileUrl = uploaded.url;
  } catch (error) {
    console.error("Attendance import upload error:", error);
    return NextResponse.json({ error: "Failed to store the uploaded file." }, { status: 500 });
  }

  await connectDB();
  const Staff = getModel("staff");
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

  const matches: Record<string, StaffMatch | null> = {};
  for (const emp of parsed.employees) {
    const byBio = byBiometricId.get(emp.empCode);
    const byCode = byEmployeeCode.get(emp.empCode);
    matches[emp.empCode] = byBio
      ? { staffId: byBio, matchedBy: "biometricId" }
      : byCode
        ? { staffId: byCode, matchedBy: "employeeCode" }
        : null;
  }

  return NextResponse.json({
    fileUrl,
    fileName: file.name,
    format: parsed.format,
    dateRange: parsed.dateRange,
    employees: parsed.employees,
    matches,
  });
}
