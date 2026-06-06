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

// ==================== Leave Management ====================
export type LeaveRequestType = "leave" | "wfh" | "overtime" | "on-duty";
export type LeaveType = "CL" | "SL" | "EL" | "CO" | "HD" | "LOP";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveRequest extends BaseDocument {
  staffId: string;
  staffName?: string;
  type: LeaveRequestType;
  leaveType?: LeaveType;
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
  | "announcement";
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
  createdBy: string;
}

export interface TaskComment extends BaseDocument {
  message: string;
  authorId: string;
  authorName: string;
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
  type: "leave" | "invoice" | "event" | "task" | "system" | "payroll";
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  metadata?: { entityId: string; entityType: string };
  readAt?: Timestamp;
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
}
