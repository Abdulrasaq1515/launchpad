"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

/** Cliff threshold above which a "too far in future" warning is shown (days). */
const CLIFF_WARNING_DAYS = 730; // 2 years

interface VestingCurveChartProps {
  /** Number of days before any tokens unlock. Must be >= 0. */
  cliffDays: number;
  /** Number of days over which tokens linearly vest after the cliff. Must be > 0. */
  durationDays: number;
}

interface ChartPoint {
  day: number;
  unlocked: number;
}

function buildChartData(cliffDays: number, durationDays: number): ChartPoint[] {
  const totalDays = cliffDays + durationDays;
  if (totalDays <= 0) return [];

  // Always include the key inflection points so the step-then-ramp shape is precise.
  const keyDays = new Set<number>([0, cliffDays, totalDays]);
  const SAMPLE_COUNT = 60;
  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    keyDays.add(Math.round((i / SAMPLE_COUNT) * totalDays));
  }

  return Array.from(keyDays)
    .sort((a, b) => a - b)
    .map((day) => {
      let unlocked: number;
      if (day < cliffDays) {
        unlocked = 0;
      } else if (durationDays === 0) {
        unlocked = 100;
      } else {
        unlocked = Math.min(100, ((day - cliffDays) / durationDays) * 100);
      }
      return { day, unlocked: Math.round(unlocked * 10) / 10 };
    });
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

export function VestingCurveChart({ cliffDays, durationDays }: VestingCurveChartProps) {
  const today = useMemo(() => new Date(), []);

  const data = useMemo(
    () => buildChartData(cliffDays, durationDays),
    [cliffDays, durationDays],
  );

  if (data.length < 2) return null;

  const totalDays = cliffDays + durationDays;
  const cliffDate = formatDate(addDays(today, cliffDays));
  const endDate = formatDate(addDays(today, totalDays));
  const cliffTooFar = cliffDays > CLIFF_WARNING_DAYS;

  // X-axis ticks: today, cliff (if > 0), end. De-duplicate in case cliff == 0.
  const xTicks = Array.from(new Set([0, cliffDays, totalDays]));

  const tickFormatter = (day: number) => formatDate(addDays(today, day));

  return (
    <div className="rounded-xl bg-sunken border border-line p-4 space-y-3">
      <p className="text-xs font-medium text-muted">
        Unlock Schedule Preview
      </p>

      {cliffTooFar && (
        <div className="flex items-start gap-2 rounded-lg bg-warn-soft border border-warn/20 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-warn" aria-hidden />
          <p className="text-xs text-warn">
            Cliff is set more than 2 years in the future ({cliffDays} days).
            Verify this is intentional before proceeding.
          </p>
        </div>
      )}

      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="vestGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4f8ef7" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#4f8ef7" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.05)"
            vertical={false}
          />

          <XAxis
            dataKey="day"
            type="number"
            domain={[0, totalDays]}
            ticks={xTicks}
            tickFormatter={tickFormatter}
            tick={{ fontSize: 9, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
          />

          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 9, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            ticks={[0, 50, 100]}
          />

          <Tooltip
            formatter={(value) => {
              const pct = typeof value === "number" ? value.toFixed(1) : String(value);
              return [`${pct}%`, "Unlocked"];
            }}
            labelFormatter={(day) => {
              const d = typeof day === "number" ? day : Number(day);
              return `Day ${d} · ${tickFormatter(d)}`;
            }}
            contentStyle={{
              background: "#0f1117",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              fontSize: "11px",
              color: "#e5e7eb",
            }}
            labelStyle={{ color: "#9ca3af" }}
          />

          {/* Today */}
          <ReferenceLine x={0} stroke="#6b7280" strokeDasharray="4 3" />

          {/* Cliff */}
          {cliffDays > 0 && (
            <ReferenceLine x={cliffDays} stroke="#f59e0b" strokeDasharray="4 3" />
          )}

          {/* Full unlock */}
          <ReferenceLine x={totalDays} stroke="#22c55e" strokeDasharray="4 3" />

          <Area
            type="linear"
            dataKey="unlocked"
            stroke="#4f8ef7"
            strokeWidth={2}
            fill="url(#vestGrad)"
            dot={false}
            activeDot={{ r: 4, fill: "#4f8ef7" }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center">
        <span className="flex items-center gap-1.5 text-[10px] text-muted">
          <span className="inline-block w-3 h-px bg-gray-500" />
          Today
        </span>
        {cliffDays > 0 && (
          <span className="flex items-center gap-1.5 text-[10px] text-warn">
            <span className="inline-block w-3 h-px bg-warn" />
            Cliff · {cliffDate}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-[10px] text-ok">
          <span className="inline-block w-3 h-px bg-ok" />
          Full Unlock · {endDate}
        </span>
      </div>
    </div>
  );
}
