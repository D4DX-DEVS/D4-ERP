# D4 Media ERP - Comprehensive Project Report

## 1. Project Overview

**Project Name:** D4 Media ERP  
**Company:** D4 Media  
**Industry:** Digital Marketing, Video Production, Event Management  
**Tech Stack:** Next.js 15 (App Router) + Firebase Firestore + Firebase Auth  
**UI Framework:** Tailwind CSS + shadcn/ui  

D4 Media is a tech company comprising multiple departments that handle digital marketing, video production, and event management. The company operates under multiple sub-entities (In-house & Outsource). This ERP system will centralize staff management, leave management, accounting, invoicing, client management, and calendar/scheduling into one unified platform.

---

## 2. User Roles & Access Control

| Role | Access Level | Description |
|------|-------------|-------------|
| **Super Admin** | Full Access | Complete system control, all modules, all companies |
| **Admin** | High | Manage staff, approve requests, view reports |
| **Department Head** | Medium | Manage own department staff, approve leaves, view department reports |
| **Accounts** | Finance Only | Income/Expense, Invoicing, Client billing, Financial reports |
| **Staff** | Limited | View own profile, apply leave/WFH/OT/OD, view own records |

### Authentication System
- **Admin/Dept Head/Accounts:** Email + Password (Firebase Auth)
- **Staff:** Mobile Number (last 4 digits) + Unique Employee Code (simple PIN-based login)

---

## 3. Multi-Company Architecture

```
D4 Media (Parent)
├── In-House Company
│   ├── Department A (e.g., Digital Marketing)
│   ├── Department B (e.g., Video Production)
│   └── Department C (e.g., Events)
└── Outsource Company
    ├── Department X
    └── Department Y
```

**Key Points:**
- Multiple companies can be created under the parent entity
- Staff are **shared/common** across companies
- Income & Expenses are **company-specific** (tracked per company)
- Invoices are generated **per company** (with company-specific GST details)
- Departments exist within companies

---

## 4. Module Breakdown

### 4.1 Company Management
| Feature | Description |
|---------|-------------|
| Create Company | Add new sub-company with name, address, GST number, logo |
| Edit Company | Update company details |
| Company Settings | GST info, bank details, invoice prefix, letterhead |
| Company Dashboard | Overview stats per company |

**Firestore Collection:** `companies`
```
companies/{companyId}
├── name: string
├── address: string
├── gstNumber: string (optional)
├── panNumber: string
├── bankDetails: { bankName, accountNo, ifscCode, branchName }
├── logo: string (URL)
├── invoicePrefix: string
├── phone: string
├── email: string
├── website: string
├── isActive: boolean
├── createdAt: timestamp
└── updatedAt: timestamp
```

### 4.2 Department Management
| Feature | Description |
|---------|-------------|
| Create Department | Add department with name, description, company assignment |
| Assign Department Head | Link a staff member as department head |
| Department List | View all departments with head info |
| Department Programs | Each department can add their programs/projects |

**Firestore Collection:** `departments`
```
departments/{departmentId}
├── name: string
├── description: string
├── companyId: string (ref)
├── headId: string (ref to staff)
├── isActive: boolean
├── createdAt: timestamp
└── updatedAt: timestamp
```

### 4.3 Staff Management
| Feature | Description |
|---------|-------------|
| Add Staff | Full profile with personal & employment details |
| Edit Staff | Update any staff information |
| Staff List | Filterable list with search, department filter, status filter |
| Staff Profile | Detailed view with all history |
| Salary Management | Base salary, increments history |
| Increment/Upgradation | Record salary changes with date & reason |
| Termination | Terminate staff with date & reason, preserving records |
| Suspension | Suspend staff with period & reason |
| Status Tracking | Active, On Leave, Suspended, Terminated |

**Firestore Collections:**
```
staff/{staffId}
├── employeeCode: string (unique, for login)
├── firstName: string
├── lastName: string
├── email: string
├── mobile: string
├── address: {
│   street, city, state, pincode
│   }
├── dateOfBirth: timestamp
├── gender: string (Male/Female/Other)
├── dateOfJoining: timestamp
├── departmentId: string (ref)
├── companyId: string (ref)
├── designation: string
├── baseSalary: number
├── currentSalary: number
├── status: string (active/suspended/terminated/on-leave)
├── profileImage: string (URL)
├── role: string (admin/department-head/accounts/staff)
├── isActive: boolean
├── createdAt: timestamp
└── updatedAt: timestamp

staff/{staffId}/salaryHistory/{historyId}
├── type: string (increment/decrement/upgradation)
├── previousSalary: number
├── newSalary: number
├── reason: string
├── effectiveDate: timestamp
├── approvedBy: string (ref to staff)
├── createdAt: timestamp

staff/{staffId}/statusHistory/{historyId}
├── type: string (suspension/termination/reinstatement/leave)
├── reason: string
├── startDate: timestamp
├── endDate: timestamp (nullable for termination)
├── approvedBy: string (ref to staff)
├── createdAt: timestamp
```

### 4.4 Leave Management System
| Feature | Description |
|---------|-------------|
| Leave Request | Staff can apply for leave (casual, sick, earned, etc.) |
| Work From Home Request | Staff can request WFH days |
| Overtime Request | Staff can log overtime hours |
| On-Duty Request | Staff can request on-duty (field work, client visit) |
| Leave Balance | Track available leaves per type per staff |
| Approval Workflow | Dept Head → Admin approval chain |
| Leave Calendar | Visual calendar showing team availability |
| Leave Policy | Configurable leave types and quotas |

**Leave Types (Configurable):**
- Casual Leave (CL)
- Sick Leave (SL)
- Earned Leave (EL)
- Compensatory Off
- Half Day Leave
- Loss of Pay (LOP)

**Request Types:**
- Leave
- Work From Home (WFH)
- Overtime (OT)
- On-Duty (OD)

**Firestore Collections:**
```
leaveRequests/{requestId}
├── staffId: string (ref)
├── type: string (leave/wfh/overtime/on-duty)
├── leaveType: string (CL/SL/EL/etc., only for type=leave)
├── startDate: timestamp
├── endDate: timestamp
├── startTime: string (for half-day/OT)
├── endTime: string (for half-day/OT)
├── reason: string
├── status: string (pending/approved/rejected/cancelled)
├── approvedBy: string (ref to staff)
├── approvalDate: timestamp
├── remarks: string
├── createdAt: timestamp
└── updatedAt: timestamp

leaveBalances/{staffId}
├── year: number
├── balances: {
│   CL: { total: number, used: number, remaining: number }
│   SL: { total: number, used: number, remaining: number }
│   EL: { total: number, used: number, remaining: number }
│   }
└── updatedAt: timestamp

leavePolicy/{policyId}
├── name: string
├── leaveTypes: [{ code, name, daysPerYear, carryForward }]
├── companyId: string (ref)
├── isActive: boolean
└── createdAt: timestamp
```

### 4.5 Accounting (Income & Expense Management)
| Feature | Description |
|---------|-------------|
| Income Entry | Record income with category, amount, company, date |
| Expense Entry | Record expense with category, amount, company, date |
| Income Categories | Create & manage income categories |
| Expense Categories | Create & manage expense categories |
| Company-wise Tracking | All entries linked to specific company |
| Monthly Summary | Month-wise income vs expense |
| Payment Modes | Cash, Bank Transfer, UPI, Cheque, etc. |
| Attachments | Upload bills/receipts |

**Firestore Collections:**
```
transactions/{transactionId}
├── type: string (income/expense)
├── categoryId: string (ref)
├── companyId: string (ref)
├── amount: number
├── date: timestamp
├── description: string
├── paymentMode: string (cash/bank/upi/cheque)
├── referenceNo: string
├── attachments: [string] (URLs)
├── clientId: string (optional ref)
├── invoiceId: string (optional ref)
├── createdBy: string (ref to staff)
├── createdAt: timestamp
└── updatedAt: timestamp

categories/{categoryId}
├── name: string
├── type: string (income/expense)
├── description: string
├── isActive: boolean
├── createdAt: timestamp
└── updatedAt: timestamp
```

### 4.6 Invoice Management
| Feature | Description |
|---------|-------------|
| Create Invoice | Generate professional invoices |
| GST Invoice | With CGST/SGST/IGST breakdown |
| Non-GST Invoice | Without tax components |
| Invoice Numbering | Auto-generated, company-wise prefix |
| Quotation/Estimate | Create quotations before invoicing |
| Convert Quotation → Invoice | One-click conversion |
| Invoice Status | Draft, Sent, Paid, Partially Paid, Overdue, Cancelled |
| PDF Generation | Download/Print invoice as PDF |
| Payment Tracking | Record payments against invoices |
| Recurring Invoices | For retainer clients (optional) |

**Firestore Collections:**
```
invoices/{invoiceId}
├── invoiceNumber: string (auto-generated)
├── type: string (invoice/quotation/estimate)
├── companyId: string (ref)
├── clientId: string (ref)
├── date: timestamp
├── dueDate: timestamp
├── items: [{
│   description: string,
│   quantity: number,
│   rate: number,
│   amount: number,
│   sacCode: string (optional)
│   }]
├── subtotal: number
├── discount: { type: percentage/fixed, value: number }
├── taxType: string (gst/non-gst)
├── gstDetails: {
│   gstRate: number,
│   cgst: number,
│   sgst: number,
│   igst: number,
│   isInterState: boolean
│   }
├── totalAmount: number
├── paidAmount: number
├── balanceAmount: number
├── status: string (draft/sent/paid/partial/overdue/cancelled)
├── notes: string
├── terms: string
├── convertedFrom: string (quotation ID, if converted)
├── createdBy: string (ref to staff)
├── createdAt: timestamp
└── updatedAt: timestamp

invoicePayments/{paymentId}
├── invoiceId: string (ref)
├── amount: number
├── date: timestamp
├── paymentMode: string
├── referenceNo: string
├── notes: string
├── createdBy: string (ref to staff)
└── createdAt: timestamp
```

### 4.7 Client Management
| Feature | Description |
|---------|-------------|
| Add Client | Company name, contact person, phone, email, GST, address |
| Client List | Searchable, filterable client directory |
| Client Profile | All details + invoice history + billing summary |
| Billing Summary | Total quoted, total invoiced, total received, outstanding |
| Client Communication Log | Notes and activity tracking |
| Client Categories | Categorize clients (Retainer, Project-based, etc.) |

**Firestore Collections:**
```
clients/{clientId}
├── companyName: string
├── contactPerson: string
├── email: string
├── phone: string
├── alternatePhone: string
├── gstNumber: string (optional)
├── panNumber: string (optional)
├── address: {
│   street, city, state, pincode
│   }
├── category: string (retainer/project/one-time)
├── notes: string
├── isActive: boolean
├── createdBy: string (ref to staff)
├── createdAt: timestamp
└── updatedAt: timestamp

clients/{clientId}/activities/{activityId}
├── type: string (note/call/email/meeting)
├── description: string
├── date: timestamp
├── createdBy: string (ref to staff)
└── createdAt: timestamp
```

### 4.8 Calendar & Scheduling
| Feature | Description |
|---------|-------------|
| Event Calendar | Visual monthly/weekly/daily calendar |
| Schedule Shoots | Video/photo shoot scheduling |
| Schedule Events | Event management scheduling |
| Department Programs | Department-specific programs/projects |
| Resource Blocking | Block staff/equipment for scheduled items |
| Requirements | List requirements for each scheduled item |
| Event Types | Shoot, Event, Meeting, Deadline, etc. |
| Color Coding | Department-wise color coding |
| Notifications | Reminders for upcoming events |

**Firestore Collections:**
```
events/{eventId}
├── title: string
├── description: string
├── type: string (shoot/event/meeting/deadline/program)
├── startDate: timestamp
├── endDate: timestamp
├── startTime: string
├── endTime: string
├── isAllDay: boolean
├── departmentId: string (ref)
├── companyId: string (ref)
├── clientId: string (optional ref)
├── location: string
├── assignedStaff: [string] (refs to staff)
├── requirements: [{
│   item: string,
│   quantity: number,
│   status: string (pending/arranged/na)
│   }]
├── status: string (scheduled/in-progress/completed/cancelled)
├── color: string
├── createdBy: string (ref to staff)
├── createdAt: timestamp
└── updatedAt: timestamp
```

### 4.9 Notifications System
| Feature | Description |
|---------|-------------|
| Real-time Notifications | Instant alerts for approvals, rejections, assignments |
| Leave Notifications | Notify dept head/admin on new leave requests |
| Invoice Notifications | Payment received, overdue reminders |
| Event Reminders | Upcoming shoot/event/meeting alerts |
| Task Notifications | Task assigned, due, overdue alerts |
| System Notifications | Staff added, terminated, policy changes |
| Read/Unread Tracking | Mark as read, bulk mark, clear all |
| Notification Preferences | Per-user toggle for notification types |

**Firestore Collections:**
```
notifications/{notificationId}
├── recipientId: string (ref to staff)
├── type: string (leave/invoice/event/task/system/payroll)
├── title: string
├── message: string
├── link: string (route to navigate)
├── isRead: boolean
├── metadata: { entityId, entityType }
├── createdAt: timestamp
└── readAt: timestamp (nullable)

notificationPreferences/{staffId}
├── email: boolean
├── inApp: boolean
├── whatsapp: boolean
├── types: {
│   leave: boolean,
│   invoice: boolean,
│   event: boolean,
│   task: boolean,
│   system: boolean
│   }
└── updatedAt: timestamp
```

### 4.10 Audit Log
| Feature | Description |
|---------|-------------|
| Action Tracking | Log every create, update, delete action |
| User Attribution | Who performed the action |
| Timestamp | When the action occurred |
| Before/After Snapshots | Store previous and new values on update |
| Filterable Log | Filter by user, module, action type, date range |
| Entity Linking | Link log entry to the affected document |
| Export | Download audit log as CSV/Excel |

**Firestore Collections:**
```
auditLogs/{logId}
├── userId: string (ref to staff)
├── userName: string (denormalized)
├── action: string (create/update/delete)
├── module: string (staff/invoice/client/leave/event/...)
├── entityId: string
├── entityType: string
├── description: string
├── previousData: map (nullable)
├── newData: map (nullable)
├── ipAddress: string
├── createdAt: timestamp
```

### 4.11 Payroll Management
| Feature | Description |
|---------|-------------|
| Monthly Payroll | Auto-calculate salary based on leaves, LOP, OT |
| Salary Slip Generation | Generate monthly salary slips per staff |
| Deductions | LOP deductions, advance deductions, other deductions |
| Additions | Overtime pay, bonuses, allowances |
| Payroll Summary | Company-wise, department-wise payroll report |
| Payroll History | Month-by-month payroll records |
| Bulk Processing | Process payroll for all staff at once |
| PDF Salary Slip | Download/print salary slip as PDF |

**Firestore Collections:**
```
payroll/{payrollId}
├── staffId: string (ref)
├── month: number (1-12)
├── year: number
├── companyId: string (ref)
├── departmentId: string (ref)
├── baseSalary: number
├── workingDays: number
├── presentDays: number
├── lopDays: number
├── overtimeHours: number
├── earnings: {
│   basic: number,
│   overtime: number,
│   bonus: number,
│   allowances: number,
│   other: number
│   }
├── deductions: {
│   lop: number,
│   advance: number,
│   other: number
│   }
├── grossSalary: number
├── totalDeductions: number
├── netSalary: number
├── status: string (draft/processed/paid)
├── paidDate: timestamp (nullable)
├── paymentMode: string
├── referenceNo: string
├── processedBy: string (ref to staff)
├── createdAt: timestamp
└── updatedAt: timestamp
```

### 4.12 WhatsApp Integration
| Feature | Description |
|---------|-------------|
| Invoice Sharing | Send invoice PDF to client via WhatsApp |
| Leave Notifications | Notify staff on leave approval/rejection via WhatsApp |
| Event Reminders | Send upcoming event reminders to assigned staff |
| Salary Slip | Send monthly salary slip to staff |
| Custom Messages | Send custom messages to staff/clients |
| Template Management | Manage WhatsApp message templates |
| Delivery Status | Track message delivery status |

**Integration:** WhatsApp Business API (via providers like Twilio, WATI, or Interakt)

**Firestore Collections:**
```
whatsappMessages/{messageId}
├── recipientPhone: string
├── recipientName: string
├── recipientType: string (staff/client)
├── recipientId: string (ref)
├── templateId: string
├── type: string (invoice/leave/event/salary/custom)
├── message: string
├── attachmentUrl: string (nullable)
├── status: string (queued/sent/delivered/read/failed)
├── errorMessage: string (nullable)
├── sentBy: string (ref to staff)
├── sentAt: timestamp
├── deliveredAt: timestamp (nullable)
└── createdAt: timestamp

whatsappTemplates/{templateId}
├── name: string
├── type: string (invoice/leave/event/salary/custom)
├── content: string (with {{placeholders}})
├── isActive: boolean
├── createdAt: timestamp
└── updatedAt: timestamp
```

### 4.13 Task Management
| Feature | Description |
|---------|-------------|
| Create Task | Title, description, priority, deadline, assignee |
| Assign Tasks | Assign to staff within/across departments |
| Task Boards | Kanban-style board (To Do → In Progress → Done) |
| Task Status | To Do, In Progress, Review, Done |
| Priority Levels | Low, Medium, High, Urgent |
| Sub-tasks | Break tasks into smaller checklist items |
| Comments | Discussion thread on each task |
| Deadline Tracking | Overdue alerts, due-soon reminders |
| Department Tasks | Filter by department |
| My Tasks | Staff can see their assigned tasks |
| Link to Events | Associate tasks with calendar events/projects |

**Firestore Collections:**
```
tasks/{taskId}
├── title: string
├── description: string
├── status: string (todo/in-progress/review/done)
├── priority: string (low/medium/high/urgent)
├── assigneeId: string (ref to staff)
├── assignedBy: string (ref to staff)
├── departmentId: string (ref)
├── companyId: string (ref)
├── eventId: string (optional ref to event)
├── clientId: string (optional ref to client)
├── dueDate: timestamp
├── completedAt: timestamp (nullable)
├── subtasks: [{
│   title: string,
│   isCompleted: boolean
│   }]
├── tags: [string]
├── createdBy: string (ref to staff)
├── createdAt: timestamp
└── updatedAt: timestamp

tasks/{taskId}/comments/{commentId}
├── message: string
├── authorId: string (ref to staff)
├── authorName: string (denormalized)
├── createdAt: timestamp
```

### 4.14 Asset Management
| Feature | Description |
|---------|-------------|
| Add Asset | Name, category, serial number, purchase details |
| Asset Categories | Cameras, Lenses, Lights, Drones, Vehicles, Laptops, etc. |
| Asset Assignment | Assign/return assets to/from staff |
| Assignment History | Track who had which asset and when |
| Asset Status | Available, Assigned, Under Maintenance, Retired |
| Maintenance Log | Record repairs, servicing, costs |
| Asset Valuation | Purchase price, current value, depreciation |
| QR Code | Generate QR for quick asset identification |
| Availability Check | Check if asset is free for a date range |
| Link to Events | Block assets for scheduled shoots/events |

**Firestore Collections:**
```
assets/{assetId}
├── name: string
├── category: string (camera/lens/light/drone/vehicle/laptop/other)
├── brand: string
├── model: string
├── serialNumber: string
├── purchaseDate: timestamp
├── purchasePrice: number
├── currentValue: number
├── companyId: string (ref)
├── status: string (available/assigned/maintenance/retired)
├── currentAssigneeId: string (nullable, ref to staff)
├── image: string (URL)
├── notes: string
├── qrCode: string
├── isActive: boolean
├── createdAt: timestamp
└── updatedAt: timestamp

assets/{assetId}/assignments/{assignmentId}
├── staffId: string (ref)
├── staffName: string (denormalized)
├── assignedDate: timestamp
├── returnDate: timestamp (nullable)
├── assignedBy: string (ref to staff)
├── condition: string (good/damaged/fair)
├── notes: string
└── createdAt: timestamp

assets/{assetId}/maintenance/{maintenanceId}
├── type: string (repair/service/replacement)
├── description: string
├── cost: number
├── vendor: string
├── date: timestamp
├── completedDate: timestamp (nullable)
├── status: string (pending/in-progress/completed)
├── createdBy: string (ref to staff)
└── createdAt: timestamp
```

### 4.15 Attendance System
| Feature | Description |
|---------|-------------|
| Daily Check-in/out | Staff clock-in and clock-out |
| Location Tracking | Optional GPS coordinates on check-in |
| Late Arrival Tracking | Flag if check-in after designated time |
| Early Departure | Flag if check-out before designated time |
| Working Hours | Auto-calculate daily working hours |
| Monthly Summary | Days present, absent, late, half-day |
| Department Attendance | Department-wise attendance view |
| Attendance Report | Monthly attendance report per staff |
| Integration with Payroll | Feed attendance data into payroll calculation |
| Integration with Leave | Auto-mark approved leaves in attendance |

**Firestore Collections:**
```
attendance/{attendanceId}
├── staffId: string (ref)
├── date: timestamp (date only)
├── checkIn: timestamp
├── checkOut: timestamp (nullable)
├── checkInLocation: { lat: number, lng: number } (optional)
├── checkOutLocation: { lat: number, lng: number } (optional)
├── status: string (present/absent/half-day/late/leave/wfh/on-duty)
├── workingHours: number (auto-calculated)
├── isLate: boolean
├── isEarlyDeparture: boolean
├── remarks: string
├── leaveRequestId: string (optional ref)
├── createdAt: timestamp
└── updatedAt: timestamp

attendanceSettings/{companyId}
├── checkInTime: string (e.g., "09:00")
├── checkOutTime: string (e.g., "18:00")
├── lateGracePeriod: number (minutes)
├── halfDayHours: number
├── fullDayHours: number
├── weeklyOff: [string] (e.g., ["Sunday"])
├── locationRequired: boolean
└── updatedAt: timestamp
```

### 4.16 Reports & Dashboard
| Report | Description |
|--------|-------------|
| **Dashboard** | Overview cards with key metrics |
| **Income vs Expense** | Company-wise, monthly, yearly |
| **Profit & Loss** | Revenue - Expenses summary |
| **Staff Report** | Headcount, department-wise, salary summary |
| **Leave Report** | Leave utilization per staff/department |
| **Client Revenue** | Revenue per client, top clients |
| **Invoice Aging** | Outstanding invoices by age |
| **Quotation vs Invoice** | Conversion rate, value comparison |
| **Attendance Summary** | Present/absent/late trends |
| **Department Performance** | Programs, events per department |
| **Payroll Report** | Monthly payroll summary, department-wise |
| **Asset Report** | Asset utilization, maintenance costs |
| **Task Report** | Task completion rates, overdue tasks |

---

## 5. Application Architecture

### 5.1 Route Structure (Next.js App Router)
```
app/
├── (auth)/
│   ├── login/                    # Admin/Dept Head login
│   └── staff-login/              # Staff login (mobile + code)
├── (dashboard)/
│   ├── layout.tsx                # Sidebar + Header layout
│   ├── page.tsx                  # Main Dashboard
│   ├── companies/
│   │   ├── page.tsx              # Company list
│   │   ├── new/page.tsx          # Create company
│   │   └── [id]/page.tsx         # Company details
│   ├── departments/
│   │   ├── page.tsx              # Department list
│   │   ├── new/page.tsx          # Create department
│   │   └── [id]/page.tsx         # Department details
│   ├── staff/
│   │   ├── page.tsx              # Staff list
│   │   ├── new/page.tsx          # Add staff
│   │   └── [id]/
│   │       ├── page.tsx          # Staff profile
│   │       ├── salary/page.tsx   # Salary history
│   │       └── leaves/page.tsx   # Leave history
│   ├── leaves/
│   │   ├── page.tsx              # All leave requests (admin view)
│   │   ├── calendar/page.tsx     # Leave calendar
│   │   └── policy/page.tsx       # Leave policy settings
│   ├── accounting/
│   │   ├── page.tsx              # Transactions list
│   │   ├── income/new/page.tsx   # Add income
│   │   ├── expense/new/page.tsx  # Add expense
│   │   └── categories/page.tsx   # Manage categories
│   ├── invoices/
│   │   ├── page.tsx              # Invoice list
│   │   ├── new/page.tsx          # Create invoice
│   │   ├── [id]/page.tsx         # Invoice details
│   │   └── [id]/pdf/page.tsx     # PDF view
│   ├── quotations/
│   │   ├── page.tsx              # Quotation list
│   │   ├── new/page.tsx          # Create quotation
│   │   └── [id]/page.tsx         # Quotation details
│   ├── clients/
│   │   ├── page.tsx              # Client list
│   │   ├── new/page.tsx          # Add client
│   │   └── [id]/page.tsx         # Client profile
│   ├── calendar/
│   │   └── page.tsx              # Calendar view
│   ├── tasks/
│   │   ├── page.tsx              # Task board (Kanban)
│   │   ├── list/page.tsx         # Task list view
│   │   ├── new/page.tsx          # Create task
│   │   └── [id]/page.tsx         # Task details
│   ├── assets/
│   │   ├── page.tsx              # Asset list
│   │   ├── new/page.tsx          # Add asset
│   │   ├── [id]/page.tsx         # Asset details & history
│   │   └── categories/page.tsx   # Asset categories
│   ├── attendance/
│   │   ├── page.tsx              # Today's attendance
│   │   ├── report/page.tsx       # Attendance report
│   │   └── settings/page.tsx     # Attendance settings
│   ├── payroll/
│   │   ├── page.tsx              # Payroll dashboard
│   │   ├── process/page.tsx      # Process monthly payroll
│   │   ├── [id]/page.tsx         # Salary slip details
│   │   └── history/page.tsx      # Payroll history
│   ├── notifications/
│   │   └── page.tsx              # All notifications
│   ├── audit-log/
│   │   └── page.tsx              # Audit log viewer
│   ├── whatsapp/
│   │   ├── page.tsx              # Message history
│   │   └── templates/page.tsx    # Template management
│   ├── reports/
│   │   ├── page.tsx              # Report types
│   │   ├── income-expense/       # Income vs Expense report
│   │   ├── staff/                # Staff report
│   │   ├── leaves/               # Leave report
│   │   ├── clients/              # Client revenue report
│   │   ├── invoices/             # Invoice aging report
│   │   ├── payroll/              # Payroll report
│   │   ├── attendance/           # Attendance report
│   │   ├── assets/               # Asset report
│   │   └── tasks/                # Task report
│   └── settings/
│       ├── page.tsx              # General settings
│       └── profile/page.tsx      # Profile settings
├── (staff-portal)/
│   ├── layout.tsx                # Staff portal layout
│   ├── page.tsx                  # Staff dashboard
│   ├── leave/page.tsx            # Apply leave/WFH/OT/OD
│   ├── my-leaves/page.tsx        # My leave history
│   ├── my-tasks/page.tsx         # My assigned tasks
│   ├── attendance/page.tsx       # Check-in / Check-out
│   ├── salary-slip/page.tsx      # View salary slips
│   └── profile/page.tsx          # My profile
```

### 5.2 Tech Stack Details
| Technology | Purpose |
|-----------|---------|
| **Next.js 15** | Full-stack React framework (App Router) |
| **TypeScript** | Type safety across the app |
| **Firebase Firestore** | NoSQL database |
| **Firebase Auth** | Authentication (Email + Custom tokens for staff) |
| **Firebase Storage** | File uploads (logos, receipts, profile images) |
| **Tailwind CSS** | Utility-first CSS framework |
| **shadcn/ui** | Pre-built accessible UI components |
| **React Hook Form + Zod** | Form handling & validation |
| **date-fns** | Date manipulation |
| **jsPDF / @react-pdf/renderer** | PDF invoice generation |
| **FullCalendar / react-big-calendar** | Calendar component |
| **Recharts** | Charts for dashboard & reports |
| **Zustand** | Lightweight state management |
| **next-themes** | Dark/Light mode support |

---

## 6. Firestore Security Rules (Overview)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Admin: full access
    // Department Head: read all, write own department
    // Accounts: read/write financial data
    // Staff: read own data, write leave requests

    match /companies/{companyId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    match /staff/{staffId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin() || isDeptHead();
      // Staff can read their own profile
    }

    match /leaveRequests/{requestId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated(); // Staff can create
      allow update: if isAdmin() || isDeptHead(); // Only approve/reject
    }

    match /transactions/{transactionId} {
      allow read: if isAdmin() || isAccounts();
      allow write: if isAdmin() || isAccounts();
    }

    match /invoices/{invoiceId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin() || isAccounts();
    }

    match /clients/{clientId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin() || isAccounts() || isDeptHead();
    }

    match /events/{eventId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin() || isDeptHead();
    }

    match /tasks/{taskId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
      allow update: if isAdmin() || isDeptHead() || isAssignee();
    }

    match /assets/{assetId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin() || isDeptHead();
    }

    match /attendance/{attendanceId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated(); // Staff can check-in
      allow update: if isAdmin() || isOwner();
    }

    match /payroll/{payrollId} {
      allow read: if isAdmin() || isAccounts() || isOwner();
      allow write: if isAdmin() || isAccounts();
    }

    match /notifications/{notificationId} {
      allow read: if isRecipient();
      allow update: if isRecipient(); // Mark as read
      allow create: if isAdmin() || isDeptHead();
    }

    match /auditLogs/{logId} {
      allow read: if isAdmin();
      allow create: if isAuthenticated(); // System writes
    }

    match /whatsappMessages/{messageId} {
      allow read: if isAdmin() || isAccounts();
      allow create: if isAdmin() || isAccounts();
    }
  }
}
```

---

## 7. Development Phases

### Phase 1: Foundation (Week 1-2)
- [x] Project setup (Next.js + Firebase + Tailwind + shadcn/ui)
- [ ] Authentication system (Admin login + Staff PIN login)
- [ ] Layout (Sidebar, Header, Role-based navigation)
- [ ] Company CRUD
- [ ] Department CRUD

### Phase 2: Staff Management (Week 3-4)
- [ ] Staff CRUD with full profile
- [ ] Salary management & increment history
- [ ] Staff status management (active/suspended/terminated)
- [ ] Staff directory with search & filters

### Phase 3: Leave Management (Week 5-6)
- [ ] Leave policy configuration
- [ ] Staff portal - Leave/WFH/OT/OD request forms
- [ ] Approval workflow (Dept Head → Admin)
- [ ] Leave balance tracking
- [ ] Leave calendar view

### Phase 4: Finance (Week 7-9)
- [ ] Income & Expense categories
- [ ] Transaction entries (company-wise)
- [ ] Client management
- [ ] Invoice/Quotation generation
- [ ] GST & Non-GST invoice support
- [ ] PDF generation
- [ ] Quotation → Invoice conversion

### Phase 5: Task & Asset Management (Week 10-11)
- [ ] Task CRUD with Kanban board
- [ ] Task assignment & comments
- [ ] Sub-tasks & deadline tracking
- [ ] Asset CRUD with categories
- [ ] Asset assignment & return tracking
- [ ] Maintenance log
- [ ] QR code generation

### Phase 6: Attendance & Payroll (Week 12-13)
- [ ] Attendance check-in/out system
- [ ] Location tracking (optional GPS)
- [ ] Late/early departure flagging
- [ ] Monthly payroll processing
- [ ] Salary slip generation (PDF)
- [ ] LOP, OT, bonus calculations
- [ ] Attendance ↔ Leave ↔ Payroll integration

### Phase 7: Notifications & WhatsApp (Week 14)
- [ ] In-app notification system
- [ ] Notification preferences per user
- [ ] WhatsApp Business API integration
- [ ] Message templates management
- [ ] Invoice/salary slip sharing via WhatsApp

### Phase 8: Audit, Calendar & Reports (Week 15-16)
- [ ] Audit log system (all CRUD actions)
- [ ] Calendar with event/shoot/program scheduling
- [ ] Resource blocking & requirements
- [ ] Dashboard with key metrics
- [ ] All reports (financial, staff, leave, attendance, payroll, asset, task)

### Phase 9: Polish & Deploy (Week 17-18)
- [ ] Responsive design optimization
- [ ] Performance optimization
- [ ] Testing
- [ ] Data export (CSV/Excel)
- [ ] Deployment

---

## 8. UI/UX Design Approach

- **Design System:** shadcn/ui components for consistency
- **Layout:** Collapsible sidebar with role-based menu items
- **Theme:** Professional, clean with D4 Media branding
- **Dark Mode:** Supported via next-themes
- **Responsive:** Mobile-first, works on all devices
- **Staff Portal:** Simplified, mobile-optimized for staff use

### Color Palette (Suggested)
```
Primary:    #2563EB (Blue)
Secondary:  #7C3AED (Purple)
Success:    #16A34A (Green)
Warning:    #EA580C (Orange)
Danger:     #DC2626 (Red)
Background: #FAFAFA (Light) / #0A0A0A (Dark)
```

---

## 9. Future Enhancements (Post-Launch)

1. **Document Management** - Store important documents per staff/client
2. **Backup & Export** - Automated cloud backup, data export to Excel/CSV
3. **Multi-language Support** - Malayalam + English
4. **Project Management** - Link clients → projects → invoices → expenses
5. **Vendor Management** - Track outsourced vendors & their payments
6. **Mobile App** - React Native companion app for staff attendance & tasks
7. **Biometric Integration** - Fingerprint/face recognition for attendance
8. **Email Integration** - Send invoices & notifications via email

---

## 10. Firestore Collections Summary

| Collection | Purpose |
|-----------|---------|
| `companies` | Sub-company entities |
| `departments` | Department master data |
| `staff` | Employee records |
| `staff/{id}/salaryHistory` | Salary change log |
| `staff/{id}/statusHistory` | Status change log |
| `leaveRequests` | All leave/WFH/OT/OD requests |
| `leaveBalances` | Leave balance per staff per year |
| `leavePolicy` | Leave type configuration |
| `transactions` | Income & Expense entries |
| `categories` | Income/Expense categories |
| `invoices` | Invoices & Quotations |
| `invoicePayments` | Payments against invoices |
| `clients` | Client directory |
| `clients/{id}/activities` | Client activity log |
| `events` | Calendar events/shoots/programs |
| `notifications` | User notifications |
| `notificationPreferences` | Per-user notification settings |
| `auditLogs` | Action tracking log |
| `payroll` | Monthly payroll records |
| `whatsappMessages` | WhatsApp message log |
| `whatsappTemplates` | WhatsApp message templates |
| `tasks` | Task management |
| `tasks/{id}/comments` | Task discussion threads |
| `assets` | Equipment/vehicle registry |
| `assets/{id}/assignments` | Asset assignment history |
| `assets/{id}/maintenance` | Asset maintenance log |
| `attendance` | Daily attendance records |
| `attendanceSettings` | Company attendance rules |
| `settings` | App configuration |

---

**Total Modules: 16 | Total Firestore Collections: 31 | Development: ~18 weeks**

**Ready to begin development. Start with Phase 1: Foundation.**
