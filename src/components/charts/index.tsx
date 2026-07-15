"use client";

import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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

// ── Shared pieces ─────────────────────────────────────────────────────────────

const AXIS_TICK = { fontSize: 11, fill: "#94a3b8" };

interface TooltipEntry {
  name?: string | number;
  value?: string | number;
  color?: string;
  payload?: Record<string, unknown>;
}

/** Rounded-card tooltip shared by all charts. */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
      {label !== undefined && label !== "" && (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      )}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="capitalize text-slate-500">{entry.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums text-slate-900">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Compact dot legend rendered below each chart. */
function DotLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-[11px] font-medium capitalize text-slate-500">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-56 w-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 sm:h-64">
      <p className="text-sm text-slate-400">No data yet</p>
    </div>
  );
}

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

const ATTENDANCE_SERIES = ["present", "late", "absent"] as const;

export function AttendanceTrendChart({ data }: AttendanceTrendChartProps) {
  if (!data || data.length === 0) return <EmptyChart />;

  return (
    <div className="w-full">
      <div className="h-52 w-full sm:h-60">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
            <defs>
              {ATTENDANCE_SERIES.map((key) => (
                <linearGradient key={key} id={`att-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ATTENDANCE_STATUS_COLORS[key]} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={ATTENDANCE_STATUS_COLORS[key]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="4 8" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="day" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#cbd5e1", strokeDasharray: "4 4" }} />
            {ATTENDANCE_SERIES.map((key) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={ATTENDANCE_STATUS_COLORS[key]}
                strokeWidth={2.5}
                fill={`url(#att-${key})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <DotLegend items={ATTENDANCE_SERIES.map((key) => ({ label: key, color: ATTENDANCE_STATUS_COLORS[key] }))} />
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
  if (!data || data.length === 0) return <EmptyChart />;

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="w-full">
      <div className="relative h-52 w-full sm:h-60">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={3}
              cornerRadius={6}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={TASK_STATUS_COLORS[entry.name.toLowerCase()] || CHART_COLORS.blue}
                />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-bold tabular-nums text-slate-900">{total}</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Tasks</p>
        </div>
      </div>
      <DotLegend
        items={data.map((d) => ({
          label: `${d.name} · ${d.value}`,
          color: TASK_STATUS_COLORS[d.name.toLowerCase()] || CHART_COLORS.blue,
        }))}
      />
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

const INCOME_COLOR = CHART_COLORS.emerald;
const EXPENSE_COLOR = "#f43f5e";

export function IncomeExpenseChart({ data }: IncomeExpenseChartProps) {
  if (!data || data.length === 0) return <EmptyChart />;

  return (
    <div className="w-full">
      <div className="h-52 w-full sm:h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="4 8" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={54}
              tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9", radius: 8 }} />
            <Bar dataKey="income" fill={INCOME_COLOR} radius={[6, 6, 0, 0]} maxBarSize={28} />
            <Bar dataKey="expense" fill={EXPENSE_COLOR} radius={[6, 6, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DotLegend
        items={[
          { label: "income", color: INCOME_COLOR },
          { label: "expense", color: EXPENSE_COLOR },
        ]}
      />
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
  if (!data || data.length === 0) return <EmptyChart />;

  const types = leaveTypes || (data.length > 0 ? Object.keys(data[0]).filter((k) => k !== "month") : []);
  const colorSequence = [CHART_COLORS.blue, CHART_COLORS.emerald, CHART_COLORS.orange, CHART_COLORS.purple];

  return (
    <div className="w-full">
      <div className="h-52 w-full sm:h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="4 8" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} dy={6} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9", radius: 8 }} />
            {types.map((type, idx) => (
              <Bar
                key={type}
                dataKey={type}
                stackId="leave"
                fill={colorSequence[idx % colorSequence.length]}
                maxBarSize={28}
                radius={idx === types.length - 1 ? [6, 6, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {types.length >= 2 && (
        <DotLegend
          items={types.map((type, idx) => ({ label: type, color: colorSequence[idx % colorSequence.length] }))}
        />
      )}
    </div>
  );
}
