"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { getCanonicalRefRange } from "@/lib/labInterpret";

// ─── types ──────────────────────────────────────────────────────────────────

export type MetricTrend = {
  name: string;
  data: Array<{ date: string; value: number | null }>;
};

type RefRange = { low: number; high: number; unit: string };

type ChartRow = Record<string, string | number | null>;

// ─── constants ───────────────────────────────────────────────────────────────

/** 8 perceptually distinct colours that work on both light and dark backgrounds */
const PALETTE = [
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#a3e635", // lime
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function normalizeValue(v: number, low: number, high: number): number {
  if (high === low) return 0.5;
  return (v - low) / (high - low);
}

function formatDisplayDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function fmtNum(n: number): string {
  return (n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, "");
}

function statusFor(norm: number): "low" | "in_range" | "high" {
  if (norm < -0.05) return "low";
  if (norm > 1.05) return "high";
  return "in_range";
}

// ─── custom tooltip ──────────────────────────────────────────────────────────

type TooltipEntry = {
  dataKey: string;
  value: number | null;
  color: string;
  name: string;
  payload: ChartRow;
};

function MetricTooltip({
  active,
  payload,
  label,
  refMap,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  refMap: Record<string, RefRange | null>;
}) {
  if (!active || !payload?.length) return null;
  const valid = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (!valid.length) return null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-xl text-xs min-w-[200px] pointer-events-none">
      <p className="font-semibold text-[var(--fg)] mb-2">{label}</p>
      <div className="space-y-1.5">
        {valid.map((p) => {
          const metricName = p.name;
          const ref = refMap[metricName];
          const norm = p.value as number;
          const actual = p.payload[`${metricName}_actual`] as number | null;
          const unit = ref?.unit ?? "";
          const status = statusFor(norm);
          const displayVal =
            actual !== null ? `${fmtNum(actual)}${unit ? "\u2009" + unit : ""}` : "—";

          return (
            <div key={metricName} className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full shrink-0 inline-block"
                style={{ background: p.color }}
              />
              <span className="text-[var(--muted)] min-w-[5rem] truncate">{metricName}</span>
              <span className="font-semibold ml-auto pl-3 text-[var(--fg)]">{displayVal}</span>
              {status !== "in_range" && (
                <span className="text-amber-500 font-medium">{status === "low" ? "↓" : "↑"}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── clickable legend ────────────────────────────────────────────────────────

function ChartLegend({
  metrics,
  colors,
  hidden,
  onToggle,
}: {
  metrics: string[];
  colors: string[];
  hidden: Set<string>;
  onToggle: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 pt-2 pb-0.5">
      {metrics.map((name, i) => (
        <button
          key={name}
          type="button"
          onClick={() => onToggle(name)}
          className="flex items-center gap-1.5 text-[11px] transition-opacity select-none"
          style={{ opacity: hidden.has(name) ? 0.35 : 1 }}
        >
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0 inline-block border-2"
            style={{
              background: colors[i % colors.length],
              borderColor: colors[i % colors.length],
            }}
          />
          <span className="text-[var(--fg)]">{name}</span>
        </button>
      ))}
    </div>
  );
}

// ─── gauge bar card ──────────────────────────────────────────────────────────

function GaugeCard({
  name,
  value,
  date,
  ref: ref_,
  color,
}: {
  name: string;
  value: number;
  date: string;
  ref: RefRange;
  color: string;
}) {
  const norm = normalizeValue(value, ref_.low, ref_.high);
  const status = statusFor(norm);
  // Map [-0.25 … 1.25] → [0 … 100]% for the marker
  const displayNorm = Math.min(Math.max(norm, -0.25), 1.25);
  const markerPct = ((displayNorm + 0.25) / 1.5) * 100;

  const statusColor = status === "in_range" ? "#22c55e" : "#f59e0b";
  const statusText =
    status === "in_range" ? "In range" : status === "low" ? "Below range" : "Above range";

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{name}</p>
            {date ? (
              <p className="text-xs text-[var(--muted)] mt-0.5">{formatDisplayDate(date)}</p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <p className="text-xl font-bold leading-none" style={{ color }}>
              {fmtNum(value)}
              <span className="text-xs font-normal text-[var(--muted)] ml-1">{ref_.unit}</span>
            </p>
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap"
              style={{ background: `${statusColor}22`, color: statusColor }}
            >
              {statusText}
            </span>
          </div>
        </div>

        {/* range bar */}
        <div className="relative h-2">
          <div className="absolute inset-0 flex rounded-full overflow-hidden">
            <div style={{ width: "16.7%", background: "#f59e0b", opacity: 0.45 }} />
            <div style={{ width: "66.6%", background: "#22c55e", opacity: 0.35 }} />
            <div style={{ width: "16.7%", background: "#f59e0b", opacity: 0.45 }} />
          </div>
          <div
            className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-[var(--panel)] shadow-md transition-[left]"
            style={{ left: `calc(${markerPct}% - 8px)`, background: statusColor }}
          />
        </div>

        <div className="flex justify-between text-[10px] text-[var(--muted)] leading-none">
          <span>
            &lt;&thinsp;{fmtNum(ref_.low)}&thinsp;{ref_.unit}
          </span>
          <span>Normal range</span>
          <span>
            &gt;&thinsp;{fmtNum(ref_.high)}&thinsp;{ref_.unit}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── main exported section ───────────────────────────────────────────────────

export function HealthTrendsSection({ metrics }: { metrics: MetricTrend[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const refMap = useMemo<Record<string, RefRange | null>>(() => {
    const m: Record<string, RefRange | null> = {};
    metrics.forEach((t) => {
      m[t.name] = getCanonicalRefRange(t.name);
    });
    return m;
  }, [metrics]);

  // Only chart metrics that have a known reference range (so normalisation makes sense)
  const chartMetrics = useMemo(
    () => metrics.filter((t) => refMap[t.name] !== null),
    [metrics, refMap]
  );

  // Merge all ISO dates across every metric into one sorted timeline
  const mergedDates = useMemo<string[]>(() => {
    const s = new Set<string>();
    chartMetrics.forEach((t) => t.data.forEach((p) => { if (p.date) s.add(p.date); }));
    return [...s].sort();
  }, [chartMetrics]);

  // Build flat chart rows: { date, displayDate, HbA1c_norm, HbA1c_actual, LDL_norm, … }
  const chartData = useMemo<ChartRow[]>(() => {
    return mergedDates.map((iso) => {
      const row: ChartRow = { date: iso, displayDate: formatDisplayDate(iso) };
      chartMetrics.forEach((t) => {
        const ref = refMap[t.name]!;
        const pt = t.data.find((p) => p.date === iso);
        const val = pt?.value ?? null;
        row[`${t.name}_norm`] =
          val !== null ? normalizeValue(val, ref.low, ref.high) : null;
        row[`${t.name}_actual`] = val;
      });
      return row;
    });
  }, [mergedDates, chartMetrics, refMap]);

  // Latest readings for gauge bars
  const latestValues = useMemo(() => {
    return chartMetrics.map((t) => {
      const sorted = t.data
        .filter((p) => p.value !== null)
        .sort((a, b) => b.date.localeCompare(a.date));
      return { name: t.name, value: sorted[0]?.value ?? null, date: sorted[0]?.date ?? "" };
    });
  }, [chartMetrics]);

  const toggle = (name: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  if (!chartMetrics.length) return null;

  return (
    <div className="space-y-4">
      {/* ── unified multi-line trend chart ── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Lab trends — all metrics</h2>
              <p className="text-xs text-[var(--muted)] mt-0.5 max-w-xl">
                All biomarkers on the same scale. The{" "}
                <span className="text-emerald-500 font-medium">green band</span> is the typical
                normal zone; dots outside it may need attention. Click a metric in the legend to
                show or hide it.
              </p>
            </div>
            <Badge>{chartMetrics.length} metrics</Badge>
          </div>
        </CardHeader>
        <CardContent className="pl-0 pr-4 pb-4">
          {!ready ? (
            <div className="h-64 rounded-2xl border border-dashed border-[var(--border)] animate-pulse bg-[var(--panel-2)]" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260} minWidth={0}>
                <LineChart
                  data={chartData}
                  margin={{ left: 4, right: 8, top: 10, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="2 4"
                    stroke="var(--border)"
                    vertical={false}
                  />

                  {/* zone shading */}
                  <ReferenceArea
                    y1={-0.35}
                    y2={0}
                    fill="#f59e0b"
                    fillOpacity={0.07}
                    strokeOpacity={0}
                  />
                  <ReferenceArea
                    y1={0}
                    y2={1}
                    fill="#22c55e"
                    fillOpacity={0.1}
                    strokeOpacity={0}
                  />
                  <ReferenceArea
                    y1={1}
                    y2={1.35}
                    fill="#f59e0b"
                    fillOpacity={0.07}
                    strokeOpacity={0}
                  />

                  <XAxis
                    dataKey="displayDate"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    hide
                    domain={[-0.35, 1.35]}
                  />

                  <Tooltip
                    content={(props) => (
                      <MetricTooltip
                        active={props.active}
                        payload={props.payload as TooltipEntry[]}
                        label={props.label as string}
                        refMap={refMap}
                      />
                    )}
                  />

                  {chartMetrics.map((t, i) => (
                    <Line
                      key={t.name}
                      dataKey={`${t.name}_norm`}
                      name={t.name}
                      stroke={PALETTE[i % PALETTE.length]}
                      strokeWidth={2}
                      dot={{ r: 3.5, fill: PALETTE[i % PALETTE.length], strokeWidth: 0 }}
                      activeDot={{ r: 5.5 }}
                      connectNulls={false}
                      type="monotone"
                      hide={hidden.has(t.name)}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>

              <ChartLegend
                metrics={chartMetrics.map((t) => t.name)}
                colors={PALETTE}
                hidden={hidden}
                onToggle={toggle}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* ── current-value gauge bars ── */}
      {latestValues.some((v) => v.value !== null) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {latestValues.map((v, i) => {
            const ref = refMap[v.name];
            if (!ref || v.value === null) return null;
            return (
              <GaugeCard
                key={v.name}
                name={v.name}
                value={v.value}
                date={v.date}
                ref={ref}
                color={PALETTE[i % PALETTE.length]}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
