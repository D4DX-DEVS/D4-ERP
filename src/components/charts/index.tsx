"use client";

import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ── Color palette (fixed categorical order) ──────────────────────────────────
const CHART_COLORS = {
  blue: "#2563eb",
  emerald: "#059669",
  orange: "#f97316",
  purple: "#9333ea",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  done: CHART_COLORS.emerald,
  "in-progress": CHART_COLORS.blue,
  review: CHART_COLORS.purple,
  todo: "#94a3b8",
};

const ATTENDANCE_STATUS_COLORS: Record<string, string> = {
  present: CHART_COLORS.blue,
  late: CHART_COLORS.orange,
  absent: CHART_COLORS.purple,
};

// ── Attendance Trend Chart ───────────────────────────────────────────────────
interface AttendanceTrendData {
  day: string;
  present: number;
  late: number;
  absent: number;
}

interface AttendanceTrendChartProps {
  data: AttendanceTrendData[];
}

export function AttendanceTrendChart({ data }: AttendanceTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-56 sm:h-64 flex items-center justify-center bg-slate-50 rounded">
        <p className="text-sm text-slate-500">No data yet</p>
      </div>
    );
  }

  return (
    <div className="w-full h-56 sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="present"
            stroke={ATTENDANCE_STATUS_COLORS.present}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="late"
            stroke={ATTENDANCE_STATUS_COLORS.late}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="absent"
            stroke={ATTENDANCE_STATUS_COLORS.absent}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Task Status Chart (Donut) ─────────────────────────────────────────────────
interface TaskStatusData {
  name: string;
  value: number;
}

interface TaskStatusChartProps {
  data: TaskStatusData[];
}

export function TaskStatusChart({ data }: TaskStatusChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-56 sm:h-64 flex items-center justify-center bg-slate-50 rounded">
        <p className="text-sm text-slate-500">No data yet</p>
      </div>
    );
  }

  return (
    <div className="w-full h-56 sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            label
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={TASK_STATUS_COLORS[entry.name.toLowerCase()] || CHART_COLORS.blue}
              />
            ))}
          </Pie>
          <Tooltip />
          {data.length >= 2 && <Legend />}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Income/Expense Chart ──────────────────────────────────────────────────────
interface IncomeExpenseData {
  month: string;
  income: number;
  expense: number;
}

interface IncomeExpenseChartProps {
  data: IncomeExpenseData[];
}

export function IncomeExpenseChart({ data }: IncomeExpenseChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-56 sm:h-64 flex items-center justify-center bg-slate-50 rounded">
        <p className="text-sm text-slate-500">No data yet</p>
      </div>
    );
  }

  return (
    <div className="w-full h-56 sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
          <Tooltip />
          <Legend />
          <Bar
            dataKey="income"
            fill={CHART_COLORS.emerald}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="expense"
            fill="#dc2626"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Leave Usage Chart (Stacked) ──────────────────────────────────────────────
interface LeaveUsageData {
  month: string;
  [key: string]: string | number;
}

interface LeaveUsageChartProps {
  data: LeaveUsageData[];
  leaveTypes?: string[];
}

export function LeaveUsageChart({ data, leaveTypes }: LeaveUsageChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-56 sm:h-64 flex items-center justify-center bg-slate-50 rounded">
        <p className="text-sm text-slate-500">No data yet</p>
      </div>
    );
  }

  const types = leaveTypes || (data.length > 0 ? Object.keys(data[0]).filter((k) => k !== "month") : []);
  const colorSequence = [CHART_COLORS.blue, CHART_COLORS.emerald, CHART_COLORS.orange, CHART_COLORS.purple];

  return (
    <div className="w-full h-56 sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
          <Tooltip />
          {types.length >= 2 && <Legend />}
          {types.map((type, idx) => (
            <Bar
              key={type}
              dataKey={type}
              stackId="leave"
              fill={colorSequence[idx % colorSequence.length]}
              radius={idx === 0 ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
