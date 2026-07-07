import { Timestamp } from "@/lib/firestore";

// ==================== Common ====================
export interface BaseDocument {
  id?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// ==================== Company ====================
export interface Company extends BaseDocument {
  name: string;
  code?: string;
  address: string;
  gstNumber?: string;
  panNumber: string;
  bankDetails: {
    bankName: string;
    accountNo: string;
    ifscCode: string;
    branchName: string;
  };
  logo?: string;
  invoicePrefix: string;
  phone: string;
  email: string;
  website?: string;
  isActive: boolean;
}

// ==================== Department ====================
export interface Department extends BaseDocument {
  name: string;
  description: string;
  companyId: string;
  headId?: string;
  isActive: boolean;
}

// ==================== Staff ====================
export type StaffRole = "admin" | "department-head" | "accounts" | "staff";
export type StaffStatus = "active" | "suspended" | "terminated" | "on-leave";
export type Gender = "Male" | "Female" | "Other";

export type ContractType =
  | "3-months"
  | "6-months"
  | "12-months"
  | "24-months"
  | "36-months"
  | "permanent"
  | "custom";

export interface Staff extends BaseDocument {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  address: {
    street: string;
    city: string;
    state: string;
    pincode: string;
  };
  dateOfBirth: Timestamp;
  gender: Gender;
  dateOfJoining: Timestamp;
  departmentId: string;
  companyId: string;
  designation: string;
  baseSalary: number;
  currentSalary: number;
  status: StaffStatus;
  profileImage?: string;
  role: StaffRole;
  isActive: boolean;
  shiftId?: string;
  jobDescription?: string;
  contractType?: ContractType;
  contractEndDate?: Timestamp | null;
  /** Extra feature keys granted to this employee beyond their role defaults. */
  grantedFeatures?: string[];
  bankDetails?: {
    bankName: string;
    accountNo: string;
    ifscCode: string;
    branchName: string;
  };
}

export interface SalaryHistory extends BaseDocument {
  type: "increment" | "decrement" | "upgradation";
  previousSalary: number;
  newSalary: number;
  reason: string;
  effectiveDate: Timestamp;
  approvedBy: string;
}

export interface StatusHistory extends BaseDocument {
  type: "suspension" | "termination" | "reinstatement" | "leave";
  reason: string;
  startDate: Timestamp;
  endDate?: Timestamp;
  approvedBy: string;
}

export interface ContractHistory extends BaseDocument {
  previousEndDate: Timestamp | null;
  newEndDate: Timestamp | null;
  contractType: ContractType;
  reason: string;
  extendedOn: Timestamp;
}

// ==================== Employee Documents ====================
export type EmployeeDocumentCategory =
  | "cv"
  | "id-proof"
  | "certificate"
  | "contract"
  | "appointment-letter"
  | "experience-letter"
  | "relieving-letter"
  | "payslip"
  | "other";

export interface EmployeeDocument extends BaseDocument {
  staffId: string;
  name: string;
  category: EmployeeDocumentCategory;
  /** DigitalOcean Spaces URL of the stored file. */
  fileUrl: string;
  fileName?: string;
  fileSize?: number;
  notes?: string;
  uploadedBy: string;
}

// ==================== Leave Management ====================
export type LeaveRequestType = "leave" | "wfh" | "overtime" | "on-duty";
export type LeaveType = "CL" | "SL" | "EL" | "CO" | "HD" | "LOP";
export type HalfDaySession = "first-half" | "second-half";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveRequest extends BaseDocument {
  staffId: string;
  staffName?: string;
  type: LeaveRequestType;
  leaveType?: LeaveType;
  /** Whether this is a half-day request. */
  isHalfDay?: boolean;
  /** Which session for half-day: first-half (morning) or second-half (afternoon). */
  session?: HalfDaySession;
  startDate: Timestamp;
  endDate: Timestamp;
  startTime?: string;
  endTime?: string;
  reason: string;
  status: RequestStatus;
  approvedBy?: string;
  approvalDate?: Timestamp;
  remarks?: string;
}

export interface LeaveBalance extends BaseDocument {
  staffId?: string;
  year: number;
  balances: Record<string, { total: number; used: number; remaining: number }>;
}

export interface LeavePolicy extends BaseDocument {
  name: string;
  leaveTypes: {
    code: string;
    name: string;
    daysPerYear: number;
    carryForward: boolean;
  }[];
  companyId: string;
  isActive: boolean;
}

// ==================== Accounting ====================
export type TransactionType = "income" | "expense";
export type PaymentMode = "cash" | "bank" | "upi" | "cheque";

export interface Transaction extends BaseDocument {
  type: TransactionType;
  categoryId: string;
  categoryName?: string;
  companyId: string;
  amount: number;
  date: Timestamp;
  description: string;
  paymentMode: PaymentMode;
  referenceNo?: string;
  attachments?: string[];
  clientId?: string;
  invoiceId?: string;
  createdBy: string;
}

export interface Category extends BaseDocument {
  name: string;
  type: TransactionType;
  description?: string;
  isActive: boolean;
}

// ==================== Invoice ====================
export type InvoiceType = "invoice" | "quotation" | "estimate";
export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "partial"
  | "overdue"
  | "cancelled"
  | "accepted"
  | "rejected"
  | "expired"
  | "converted";

export interface InvoiceItem {
  description: string;
  subDescription?: string;
  quantity: number;
  rate: number;
  amount: number;
  sacCode?: string;
  itemId?: string;
}

export interface Invoice extends BaseDocument {
  invoiceNumber: string;
  type: InvoiceType;
  companyId: string;
  clientId: string;
  clientName?: string;
  date: Timestamp;
  dueDate: Timestamp;
  items: InvoiceItem[];
  subtotal: number;
  discount: { type: "percentage" | "fixed"; value: number };
  taxType: "gst" | "non-gst";
  gstDetails?: {
    gstRate: number;
    cgst: number;
    sgst: number;
    igst: number;
    isInterState: boolean;
  };
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: InvoiceStatus;
  notes?: string;
  terms?: string;
  convertedFrom?: string;
  convertedToInvoiceId?: string;
  createdBy: string;
}

export interface InvoicePayment extends BaseDocument {
  invoiceId: string;
  amount: number;
  date: Timestamp;
  paymentMode: PaymentMode;
  referenceNo?: string;
  notes?: string;
  receiptNumber?: string;
  createdBy: string;
}

// ==================== Item Master ====================
export type ItemType = "product" | "service";

export interface Item extends BaseDocument {
  name: string;
  itemCode: string;
  type: ItemType;
  rate: number;
  sacCode?: string;
  hsnCode?: string;
  unit?: string;
  category?: string;
  description?: string;
  isActive: boolean;
  createdBy: string;
}

// ==================== Receipt ====================
export interface Receipt extends BaseDocument {
  receiptNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  paymentId: string;
  companyId: string;
  clientId: string;
  clientName?: string;
  amount: number;
  date: Timestamp;
  paymentMode: PaymentMode;
  referenceNo?: string;
  notes?: string;
  createdBy: string;
}

// ==================== Client ====================
export type ClientCategory = "retainer" | "project" | "one-time";

export interface Client extends BaseDocument {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  alternatePhone?: string;
  gstNumber?: string;
  panNumber?: string;
  address: {
    street: string;
    city: string;
    state: string;
    pincode: string;
  };
  category: ClientCategory;
  notes?: string;
  isActive: boolean;
  createdBy: string;
}

export interface ClientActivity extends BaseDocument {
  type: "note" | "call" | "email" | "meeting";
  description: string;
  date: Timestamp;
  createdBy: string;
}

// ==================== Calendar ====================
export type EventType =
  | "shoot"
  | "event"
  | "meeting"
  | "deadline"
  | "program"
  | "delivery"
  | "holiday"
  | "reminder"
  | "leave"
  | "training"
  | "payroll"
  | "personal"
  | "announcement"
  | "studio";
export type EventStatus = "scheduled" | "in-progress" | "completed" | "cancelled";
export type EventPriority = "low" | "medium" | "high" | "urgent";
/** Visibility scope of a calendar event. */
export type EventScope = "personal" | "department" | "company";
export type RecurrenceFrequency = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface EventRecurrence {
  frequency: RecurrenceFrequency;
  /** Repeat interval, e.g. every 2 weeks. Defaults to 1. */
  interval?: number;
  /** Inclusive "YYYY-MM-DD" date after which the series stops. */
  until?: string;
}

export interface CalendarEvent extends BaseDocument {
  title: string;
  description?: string;
  type: EventType;
  startDate: Timestamp;
  endDate: Timestamp;
  startTime?: string;
  endTime?: string;
  isAllDay: boolean;
  priority?: EventPriority;
  scope?: EventScope;
  recurrence?: EventRecurrence;
  /** Lead time in minutes for an in-app reminder. 0 / undefined = no reminder. */
  reminderMinutes?: number;
  /** Soft-delete flag. Archived events are hidden from the calendar grid. */
  isArchived?: boolean;
  departmentId?: string;
  companyId?: string;
  clientId?: string;
  location?: string;
  assignedStaff: string[];
  requirements: {
    item: string;
    quantity: number;
    status: "pending" | "arranged" | "na";
  }[];
  status: EventStatus;
  color?: string;
  createdBy: string;
}

// ==================== Task ====================
export type TaskStatus = "todo" | "in-progress" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task extends BaseDocument {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string;
  assigneeName?: string;
  assignedBy: string;
  departmentId?: string;
  companyId?: string;
  eventId?: string;
  clientId?: string;
  dueDate: Timestamp;
  completedAt?: Timestamp;
  subtasks: { title: string; isCompleted: boolean }[];
  tags: string[];
  /** Percentage completion (0-100). */
  completionPercentage?: number;
  /** Linked work log IDs. */
  workLogIds?: string[];
  createdBy: string;
}

export interface TaskComment extends BaseDocument {
  message: string;
  authorId: string;
  authorName: string;
}

// ==================== Studio Booking ====================
export type StudioBookingStatus = "pending" | "approved" | "confirmed" | "in-progress" | "completed" | "rejected" | "cancelled";

export interface Studio extends BaseDocument {
  name: string;
  location?: string;
  capacity?: number;
  description?: string;
  /** Optional comma-free list of facilities for display. */
  facilities?: string[];
  isActive: boolean;
}

export interface StudioBooking extends BaseDocument {
  /** Auto-numbered booking ID (STB-001). */
  bookingId?: string;
  studioId: string;
  studioName?: string;
  /** Local date key "YYYY-MM-DD" for the booking. */
  date: string;
  /** 24h "HH:mm" start/end times. */
  startTime: string;
  endTime: string;
  /** Duration in minutes (computed). */
  duration?: number;
  bookingType?: StudioBookingType;
  purpose: string;
  notes?: string;
  clientId?: string;
  clientName?: string;
  companyName?: string;
  contactNumber?: string;
  email?: string;
  eventName?: string;
  /** Equipment allocated for this booking. */
  requiredEquipment?: { equipmentId: string; name: string }[];
  /** Staff assigned to this booking. */
  assignedStaff?: { staffId: string; staffName: string }[];
  status: StudioBookingStatus;
  statusHistory?: StatusHistoryEntry[];
  attachments?: { name: string; url: string; type: string; size?: number }[];
  /** Link to a managed event. */
  linkedEventId?: string;
  /** Staff id who requested the booking. */
  requestedBy: string;
  requestedByName?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvalDate?: Timestamp;
  rejectionReason?: string;
}

// ==================== Asset ====================
export type AssetCategory = "camera" | "lens" | "light" | "drone" | "vehicle" | "laptop" | "other";
export type AssetStatus = "available" | "assigned" | "maintenance" | "retired";

export interface Asset extends BaseDocument {
  name: string;
  category: AssetCategory;
  brand?: string;
  model?: string;
  serialNumber: string;
  purchaseDate: Timestamp;
  purchasePrice: number;
  currentValue: number;
  companyId: string;
  status: AssetStatus;
  currentAssigneeId?: string;
  image?: string;
  notes?: string;
  isActive: boolean;
  // D4-Assets integration fields
  productCode?: string;
  allowOutside?: boolean;
  warrantyDetails?: string;
  warrantyExpiryDate?: Timestamp;
  noWarranty?: boolean;
  billUrl?: string;
}

export interface AssetAssignment extends BaseDocument {
  staffId: string;
  staffName: string;
  assignedDate: Timestamp;
  returnDate?: Timestamp;
  assignedBy: string;
  condition: "good" | "damaged" | "fair";
  notes?: string;
}

export interface AssetMaintenance extends BaseDocument {
  type: "repair" | "service" | "replacement";
  description: string;
  cost: number;
  vendor?: string;
  date: Timestamp;
  completedDate?: Timestamp;
  status: "pending" | "in-progress" | "completed";
  createdBy: string;
}

// ==================== Asset Management (Events/Movements) ====================
export type AssetEventStatus = "upcoming" | "active" | "completed";
export type AssetMovementStatus = "OUT" | "IN";
export type AssetCondition = "good" | "damaged" | "defective" | "missing";
export type AssetDamageType = "damage" | "defect" | "missing";

export interface AssetCategoryItem extends BaseDocument {
  name: string;
  description?: string;
  isActive: boolean;
}

export interface AssetPerson extends BaseDocument {
  name: string;
  phone?: string;
  email?: string;
  department?: string;
  isActive: boolean;
}

export interface AssetEvent extends BaseDocument {
  name: string;
  location: string;
  fromDate: Timestamp;
  toDate: Timestamp;
  responsiblePersonId: string;
  responsiblePersonName?: string;
  status: AssetEventStatus;
  isActive: boolean;
  // Aggregated counts (populated client-side)
  totalOut?: number;
  totalIn?: number;
}

export interface AssetMovement extends BaseDocument {
  assetId: string;
  assetName?: string;
  assetCategory?: string;
  eventId: string;
  eventName?: string;
  eventLocation?: string;
  allocatedPersonId: string;
  allocatedPersonName?: string;
  status: AssetMovementStatus;
  outDate: Timestamp;
  outByName?: string;
  inDate?: Timestamp;
  returnBy?: string;
  verifiedBy?: string;
  condition: AssetCondition;
  damageReason?: string;
  remarks?: string;
}

export interface AssetDamageReport extends BaseDocument {
  movementId: string;
  assetId: string;
  assetName?: string;
  eventId: string;
  eventName?: string;
  type: AssetDamageType;
  reason: string;
  reportedByName?: string;
  isResolved: boolean;
  resolvedAt?: Timestamp;
  resolvedByName?: string;
  notes?: string;
}

export interface AssetActivityLog extends BaseDocument {
  userName: string;
  action: string;
  module: string;
  resourceId?: string;
  details?: string;
}

// ==================== Attendance ====================
export type AttendanceStatus =
  | "present"
  | "absent"
  | "half-day"
  | "late"
  | "leave"
  | "wfh"
  | "on-duty"
  | "public-holiday";

export interface Attendance extends BaseDocument {
  staffId: string;
  date: Timestamp;
  checkIn?: Timestamp;
  checkOut?: Timestamp;
  checkInLocation?: { lat: number; lng: number };
  checkOutLocation?: { lat: number; lng: number };
  status: AttendanceStatus;
  workingHours?: number;
  overtimeHours?: number;
  isLate: boolean;
  isEarlyDeparture: boolean;
  remarks?: string;
  notes?: string;
  leaveRequestId?: string;
  correctionId?: string;
  shiftId?: string;
  /** Source of the record — manual admin entry, self check-in, leave/holiday sync. */
  source?: "self" | "manual" | "leave" | "holiday" | "correction";
  isDeleted?: boolean;
  deletedAt?: Timestamp;
  deletedBy?: string;
}

export interface AttendanceSettings extends BaseDocument {
  companyId?: string;
  checkInTime: string;
  checkOutTime: string;
  lateGracePeriod: number;
  halfDayHours: number;
  fullDayHours: number;
  weeklyOff: string[];
  locationRequired: boolean;
}

// ==================== Shift ====================
export interface Shift extends BaseDocument {
  name: string;
  /** "HH:mm" 24h start time. */
  startTime: string;
  /** "HH:mm" 24h end time. */
  endTime: string;
  /** Late grace period in minutes. */
  graceMinutes: number;
  /** Crosses midnight (e.g. night shift 22:00–06:00). */
  isOvernight: boolean;
  color?: string;
  isActive: boolean;
}

// ==================== Attendance Correction ====================
export type CorrectionStatus = "pending" | "approved" | "rejected";

export interface AttendanceCorrection extends BaseDocument {
  staffId: string;
  staffName?: string;
  date: Timestamp;
  attendanceId?: string;
  requestedCheckIn?: string;
  requestedCheckOut?: string;
  requestedStatus?: AttendanceStatus;
  reason: string;
  status: CorrectionStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewDate?: Timestamp;
  reviewRemarks?: string;
}

// ==================== Payroll ====================
export type PayrollStatus = "draft" | "processed" | "paid";

export interface Payroll extends BaseDocument {
  staffId: string;
  staffName?: string;
  month: number | string;
  year: number;
  companyId: string;
  departmentId: string;
  baseSalary: number;
  basicSalary?: number;
  workingDays: number;
  presentDays: number;
  lopDays: number;
  leaveDays?: number;
  overtimeHours: number;
  earnings: {
    basic?: number;
    hra?: number;
    da?: number;
    overtime: number;
    bonus?: number;
    allowances: number;
    other?: number;
  };
  deductions: {
    pf?: number;
    esi?: number;
    tds?: number;
    lop?: number;
    advance?: number;
    loanRecovery?: number;
    otherDeductions?: number;
    other?: number;
  };
  grossSalary?: number;
  totalEarnings: number;
  totalDeductions: number;
  netSalary: number;
  status: PayrollStatus;
  paidDate?: Timestamp;
  paymentMode?: string;
  referenceNo?: string;
  processedBy: string;
}

// ==================== Notification ====================
export interface AppNotification extends BaseDocument {
  recipientId: string;
  type: "leave" | "invoice" | "event" | "task" | "system" | "payroll" | "announcement" | "studio" | "work-log";
  title: string;
  message: string;
  link?: string;
  /** Optional image (DigitalOcean Spaces URL) shown in the notification pane. */
  imageUrl?: string;
  /** Display name of the admin/user who sent a manual announcement. */
  senderName?: string;
  isRead: boolean;
  metadata?: { entityId: string; entityType: string };
  readAt?: Timestamp;
}

// ==================== Banner ====================
export interface Banner extends BaseDocument {
  title: string;
  message?: string;
  /** DigitalOcean Spaces URL of the banner image. */
  imageUrl?: string;
  link?: string;
  /** Optional visibility window (YYYY-MM-DD); empty = always active. */
  startDate?: Timestamp;
  endDate?: Timestamp;
  /** Higher numbers show first. */
  priority: number;
  /** "all" = every staff member, or a specific departmentId. */
  audience: "all" | "department";
  departmentId?: string;
  isActive: boolean;
  createdBy: string;
}

// ==================== Audit Log ====================
export interface AuditLog extends BaseDocument {
  userId: string;
  userName: string;
  action: "create" | "update" | "delete" | "login" | "logout" | "approve" | "reject";
  module: string;
  entityId: string;
  entityType: string;
  description: string;
  details?: string;
  timestamp?: Timestamp;
  ipAddress?: string;
  previousData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
}

// ==================== Status History (Cross-Cutting) ====================
export interface StatusHistoryEntry {
  status: string;
  changedBy: string;
  changedByName: string;
  changedAt: Timestamp;
  remarks?: string;
}

// ==================== Comments (Cross-Cutting) ====================
export type CommentEntityType = "event" | "studio_booking" | "task" | "work_log";

export interface Comment extends BaseDocument {
  entityType: CommentEntityType;
  entityId: string;
  text: string;
  authorId: string;
  authorName: string;
  attachments?: { name: string; url: string; type: string; size?: number }[];
}

// ==================== Work Logs ====================
export type WorkLogStatus = "draft" | "submitted" | "reviewed" | "needs-revision";
export type ActivityType =
  | "development"
  | "design"
  | "meeting"
  | "research"
  | "admin"
  | "support"
  | "fieldwork"
  | "other";

export interface WorkLogEntry {
  project: string;
  activityType: ActivityType;
  description: string;
  hours: number;
  taskId?: string;
  taskTitle?: string;
  blockers?: string;
}

export interface WorkLog extends BaseDocument {
  staffId: string;
  staffName: string;
  departmentId: string;
  date: string; // YYYY-MM-DD
  entries: WorkLogEntry[];
  totalHours: number;
  submittedAt?: Timestamp;
  status: WorkLogStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewDate?: Timestamp;
  reviewRemarks?: string;
}

// ==================== Event Management ====================
export type EventManagementStatus =
  | "inquiry"
  | "quotation"
  | "confirmed"
  | "planning"
  | "in-progress"
  | "completed"
  | "cancelled";
export type EventManagementType =
  | "shoot"
  | "wedding"
  | "corporate"
  | "concert"
  | "exhibition"
  | "other";

export interface EventStaffAssignment {
  staffId: string;
  staffName: string;
  role: string;
}

export interface ManagedEvent extends BaseDocument {
  eventId: string; // Auto: EVT-001
  title: string;
  description?: string;
  eventType: EventManagementType;
  clientId?: string;
  clientName?: string;
  venue?: string;
  location?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime?: string;
  endTime?: string;
  status: EventManagementStatus;
  statusHistory: StatusHistoryEntry[];
  budget?: number;
  actualCost?: number;
  assignedStaff: EventStaffAssignment[];
  linkedAssets?: string[];
  linkedStudioBookings?: string[];
  linkedQuotationId?: string;
  notes?: string;
  attachments?: { name: string; url: string; type: string; size?: number }[];
  tags?: string[];
  companyId: string;
  createdBy: string;
  createdByName?: string;
}

// ==================== Studio Booking (Enhanced) ====================
export type StudioBookingType =
  | "photography"
  | "videography"
  | "podcast"
  | "rehearsal"
  | "meeting"
  | "other";

export interface StudioEquipment extends BaseDocument {
  name: string;
  description?: string;
  category?: string;
  isAvailable: boolean;
  studioId?: string;
}

// ==================== Department Reports ====================
export type ReportPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
export type ReportStatus = "draft" | "published";

export interface CustomKPI {
  label: string;
  value: number;
  target?: number;
  unit: string;
  trend?: "up" | "down" | "stable";
}

export interface ReportAutoMetrics {
  attendance: { presentRate: number; lateRate: number; absentRate: number; totalDays: number };
  tasks: { total: number; completed: number; inProgress: number; overdue: number; completionRate: number };
  leaves: { approved: number; pending: number; rejected: number; byType: Record<string, number> };
  workLogs: { totalHours: number; avgHoursPerStaff: number; coverageRate: number };
  revenue?: { invoiced: number; received: number; pending: number };
}

export interface DepartmentReport extends BaseDocument {
  departmentId: string;
  departmentName: string;
  companyId: string;
  period: ReportPeriod;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  autoMetrics: ReportAutoMetrics;
  customKPIs: CustomKPI[];
  generatedBy: string;
  generatedByName?: string;
  generatedAt: Timestamp;
  status: ReportStatus;
  remarks?: string;
}

export interface CompanyReport extends BaseDocument {
  companyId: string;
  period: ReportPeriod;
  startDate: string;
  endDate: string;
  departmentBreakdown: {
    departmentId: string;
    departmentName: string;
    metrics: ReportAutoMetrics;
    customKPIs: CustomKPI[];
  }[];
  executiveSummary?: string;
  generatedBy: string;
  generatedByName?: string;
  generatedAt: Timestamp;
  status: ReportStatus;
}

// ==================== Auth ====================
export interface AuthUser {
  uid: string;
  email: string;
  role: StaffRole;
  staffId: string;
  firstName: string;
  lastName: string;
  companyId: string;
  departmentId: string;
  /** Extra feature keys granted to this employee beyond their role defaults. */
  grantedFeatures?: string[];
}
