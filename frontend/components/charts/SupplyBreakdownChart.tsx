"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp, Lock, Flame, Coins } from "lucide-react";

/**
 * Supply breakdown data structure
 */
export interface SupplyData {
  circulating: number;
  locked: number;
  burned: number;
  burnedAvailable: boolean;
  total: number;
}

/**
 * Props for SupplyBreakdownChart component
 */
export interface SupplyBreakdownChartProps {
  data: SupplyData;
  symbol: string;
  decimals: number;
}

/**
 * Format large numbers with K, M, B suffixes
 */
function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`;
  }
  return num.toFixed(2);
}

/**
 * Custom tooltip for the chart
 */
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: { name: string; value: number; percentage: number; unavailable?: boolean };
  }>;
}) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;

  if (data.unavailable) {
    return (
      <div className="rounded-lg border border-line bg-sunken/95 p-3">
        <p className="mb-2 text-sm font-semibold text-ink">{data.name}</p>
        <div className="space-y-1 text-xs">
          <p className="text-muted">
            Burn data unavailable — this contract does not expose{" "}
            <span className="data text-body">total_burned</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-sunken/95 p-3">
      <p className="mb-2 text-sm font-semibold text-ink">{data.name}</p>
      <div className="space-y-1 text-xs">
        <p className="text-body">
          Amount:{" "}
          <span className="data text-ink">
            {formatNumber(data.value)}
          </span>
        </p>
        <p className="text-body">
          Percentage:{" "}
          <span className="data text-info">
            {data.percentage.toFixed(2)}%
          </span>
        </p>
      </div>
    </div>
  );
}

/**
 * Custom legend component
 */
function CustomLegend({
  data,
}: {
  data: Array<{
    name: string;
    value: number;
    percentage: number;
    color: string;
    unavailable?: boolean;
  }>;
}) {
  const icons = {
    "Circulating Supply": <TrendingUp className="h-4 w-4" />,
    "Locked (Vesting)": <Lock className="h-4 w-4" />,
    "Total Burned": <Flame className="h-4 w-4" />,
    "Total Burned (unavailable)": <Flame className="h-4 w-4" />,
  };

  return (
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {data.map((entry, index) => (
        <div
          key={`legend-${index}`}
          className={`panel flex items-center gap-3 p-3 transition-all hover:border-info/30 ${
            entry.unavailable ? "opacity-60" : ""
          }`}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${entry.color}20`, color: entry.color }}
          >
            {icons[entry.name as keyof typeof icons]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted">
              {entry.unavailable ? (
                <span className="flex items-center gap-1">
                  Total Burned
                  <span className="inline-flex items-center rounded bg-gray-700/50 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    unavailable
                  </span>
                </span>
              ) : (
                entry.name
              )}
            </p>
            <p className="truncate data text-sm font-semibold text-ink">
              {entry.unavailable ? "—" : formatNumber(entry.value)}
            </p>
            <p className="text-xs text-info">
              {entry.unavailable ? "—" : `${entry.percentage.toFixed(2)}%`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * SupplyBreakdownChart - Visualizes token supply distribution
 *
 * Displays a donut chart showing:
 * - Circulating Supply: Tokens actively trading
 * - Locked (Vesting): Tokens locked in vesting contracts
 * - Total Burned: Tokens permanently removed from supply
 *
 * @example
 * ```tsx
 * <SupplyBreakdownChart
 *   data={{
 *     circulating: 50000000,
 *     locked: 30000000,
 *     burned: 5000000,
 *     burnedAvailable: true,
 *     total: 85000000
 *   }}
 *   symbol="TOKEN"
 *   decimals={7}
 * />
 * ```
 */
export default function SupplyBreakdownChart({
  data,
  symbol,
}: SupplyBreakdownChartProps) {
  // Color scheme inspired by DeFi dashboards

  // Prepare chart data
  const chartData = useMemo(() => {
    const total = data.total || 1; // Avoid division by zero
    const COLORS = {
      circulating: "#54a3ff", // Stellar blue
      locked: "#f59e0b", // Amber for locked
      burned: "#ef4444", // Red for burned
      burnedUnavailable: "#6b7280", // Gray for unavailable burn data
    };

    const items = [
      {
        name: "Circulating Supply",
        value: data.circulating,
        percentage: (data.circulating / total) * 100,
        color: COLORS.circulating,
        unavailable: false,
      },
      {
        name: "Locked (Vesting)",
        value: data.locked,
        percentage: (data.locked / total) * 100,
        color: COLORS.locked,
        unavailable: false,
      },
      {
        name: data.burnedAvailable ? "Total Burned" : "Total Burned (unavailable)",
        value: data.burnedAvailable ? data.burned : 0,
        percentage: data.burnedAvailable ? (data.burned / total) * 100 : 0,
        color: data.burnedAvailable ? COLORS.burned : COLORS.burnedUnavailable,
        unavailable: !data.burnedAvailable,
      },
    ];

    // When burned is unavailable, always include it as a visible placeholder
    // When burned is available, only show non-zero values
    if (!data.burnedAvailable) {
      return items;
    }
    return items.filter((item) => item.value > 0);
  }, [data]);

  // Calculate total for center display
  const totalSupply = data.circulating + data.locked + data.burned;

  return (
    <div className="panel p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink">Supply Breakdown</h3>
          <p className="mt-1 text-sm text-muted">
            Distribution of {symbol} tokens across different categories
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-info-soft px-3 py-2">
          <Coins className="h-4 w-4 text-info" />
          <span className="text-xs font-medium text-info">
            Total Supply
          </span>
        </div>
      </div>

      <div className="relative">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={120}
              paddingAngle={2}
              dataKey="value"
              animationBegin={0}
              animationDuration={800}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  stroke="rgba(10, 14, 26, 0.5)"
                  strokeWidth={2}
                  strokeDasharray={entry.unavailable ? "4 2" : undefined}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="text-xs font-medium text-muted">
            Total
          </p>
          <p className="mt-1 data text-2xl font-bold text-ink">
            {formatNumber(totalSupply)}
          </p>
          <p className="mt-0.5 text-xs text-muted">{symbol}</p>
        </div>
      </div>

      {/* Custom legend with stats */}
      <CustomLegend data={chartData} />

      {/* Additional info */}
      <div className="mt-6 rounded-lg border border-line/5 bg-white/2 p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted">Circulating %</p>
            <p className="mt-1 data font-semibold text-ink">
              {((data.circulating / totalSupply) * 100).toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-muted">Locked %</p>
            <p className="mt-1 data font-semibold text-ink">
              {((data.locked / totalSupply) * 100).toFixed(2)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
