"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, Menu, Pin, PinOff, Search, X as XIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { getCanonicalRefRange } from "@/lib/labInterpret";
import { getLabMeta } from "@/lib/labMeta";

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
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const year = d.getFullYear();
  return `${month} ${year}`;
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
              <span className="text-[var(--muted)] min-w-[5rem] truncate">
                {getLabMeta(metricName)?.friendlyName ?? metricName}
              </span>
              <span className="font-semibold ml-auto pl-3 text-[var(--fg)]">
                {displayVal}
              </span>
              {status !== "in_range" && (
                <span className="text-amber-500 font-medium">
                  {status === "low" ? "↓" : "↑"}
                </span>
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
          <span className="text-[var(--fg)]">
            {getLabMeta(name)?.friendlyName ?? name}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── gauge bar card ──────────────────────────────────────────────────────────

export function GaugeCard(props: {
  name: string;
  value: number;
  date: string;
  range: RefRange;
  color: string;
}) {
  const { name, value, date, range: refData, color } = props;
  const norm = normalizeValue(value, refData.low, refData.high);
  const status = statusFor(norm);
  // Map [-0.25 … 1.25] → [0 … 100]% for the marker
  const displayNorm = Math.min(Math.max(norm, -0.25), 1.25);
  const markerPct = ((displayNorm + 0.25) / 1.5) * 100;

  const statusColor = status === "in_range" ? "#22c55e" : "#f59e0b";
  const statusText =
    status === "in_range"
      ? "In range"
      : status === "low"
        ? "Below range"
        : "Above range";

  const meta = getLabMeta(name);
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {meta?.emoji} {meta ? meta.friendlyName : name}
            </p>
            {meta && meta.friendlyName !== name && (
              <p className="text-[10px] text-[var(--muted)]">{name}</p>
            )}
            {date ? (
              <p className="text-xs text-[var(--muted)] mt-0.5">
                {formatDisplayDate(date)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <p className="text-xl font-bold leading-none" style={{ color }}>
              {fmtNum(value)}
              <span className="text-xs font-normal text-[var(--muted)] ml-1">
                {refData.unit}
              </span>
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
            &lt;&thinsp;{fmtNum(refData.low)}&thinsp;{refData.unit}
          </span>
          <span>Normal range</span>
          <span>
            &gt;&thinsp;{fmtNum(refData.high)}&thinsp;{refData.unit}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── collapsible section wrapper ─────────────────────────────────────────────

function CollapsibleSection({
  title,
  collapsed,
  onToggle,
  children,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  id: _id,
}: {
  id?: string;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <h2 className="text-sm font-semibold">{title}</h2>
        <ChevronDown
          className="h-4 w-4 text-[var(--muted)] transition-transform"
          style={{ transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}
        />
      </button>
      {!collapsed && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

// ─── manage metrics panel ────────────────────────────────────────────────────

function ManageMetricsPanel({
  allMetrics,
  pinnedNames,
  onPinToggle,
  onClose,
  searchQuery,
  onSearchChange,
}: {
  allMetrics: string[];
  pinnedNames: string[];
  onPinToggle: (name: string) => void;
  onClose: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}) {
  const filtered = allMetrics.filter((m) =>
    (getLabMeta(m)?.friendlyName ?? m)
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Pin metrics to always show</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            Close
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--muted)]" />
          <input
            type="text"
            placeholder="Search metrics..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
          {filtered.map((metricName) => {
            const isPinned = pinnedNames.includes(metricName);
            const meta = getLabMeta(metricName);
            const displayName = meta?.friendlyName ?? metricName;

            return (
              <button
                key={metricName}
                type="button"
                onClick={() => onPinToggle(metricName)}
                className="flex items-center gap-2 p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--panel-2)] transition-colors text-left"
              >
                {isPinned ? (
                  <Pin className="h-4 w-4 text-[var(--accent)] flex-shrink-0" />
                ) : (
                  <PinOff className="h-4 w-4 text-[var(--muted)] flex-shrink-0" />
                )}
                <span className="text-sm text-[var(--fg)] truncate">
                  {displayName}
                </span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-[var(--muted)] text-center py-4">
            No metrics found
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── custom dot for out-of-range highlighting ───────────────────────────────

function OutOfRangeDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
  dataKey?: string;
  fill?: string;
  value?: number | null;
}) {
  const { cx, cy, payload, dataKey, fill } = props;
  if (cx == null || cy == null || !payload || !dataKey) return null;

  const metricName = dataKey.replace(/_norm$/, "");
  const status = payload[`${metricName}_status`] as string | undefined;

  if (status === "low" || status === "high") {
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill={fill} fillOpacity={0.15} stroke={fill} strokeWidth={1.5} strokeDasharray="3 2" />
        <circle cx={cx} cy={cy} r={3.5} fill={fill} stroke="none" />
        <text
          x={cx}
          y={status === "high" ? cy - 12 : cy + 16}
          textAnchor="middle"
          fontSize={10}
          fontWeight={700}
          fill={fill}
        >
          {status === "high" ? "▲" : "▼"}
        </text>
      </g>
    );
  }

  return <circle cx={cx} cy={cy} r={3.5} fill={fill} stroke="none" />;
}

// ─── main exported section ───────────────────────────────────────────────────

export function HealthTrendsSection({
  metrics,
  pinnedNames = [],
  onPinToggle = () => {},
}: {
  metrics: MetricTrend[];
  pinnedNames?: string[];
  onPinToggle?: (name: string) => void;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<"notable" | "all" | "custom">("notable");
  const [manageOpen, setManageOpen] = useState(false);
  const [manageSearch, setManageSearch] = useState("");
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(["lipid", "cbc", "distribution"])
  );

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

  // Only chart metrics that have a known reference range
  const chartMetrics = useMemo(
    () => metrics.filter((t) => refMap[t.name] !== null),
    [metrics, refMap]
  );

  // Smart filtering: identify "notable" metrics
  const notableMetrics = useMemo(() => {
    return chartMetrics.filter((t) => {
      // Always include pinned
      if (pinnedNames.includes(t.name)) return true;

      const ref = refMap[t.name];
      if (!ref) return false;

      // Get latest value
      const sorted = t.data
        .filter((p) => p.value !== null)
        .sort((a, b) => b.date.localeCompare(a.date));
      const latest = sorted[0];

      if (!latest) return false;

      // Check if out of range
      const norm = normalizeValue(latest.value!, ref.low, ref.high);
      if (norm < -0.02 || norm > 1.02) return true;

      // Check significant trend (≥15% change)
      if (sorted.length >= 2) {
        const oldest = sorted[sorted.length - 1];
        if (oldest.value && oldest.value !== 0) {
          const changePct = Math.abs(
            (latest.value! - oldest.value) / oldest.value
          );
          if (changePct >= 0.15) return true;
        }
      }

      return false;
    });
  }, [chartMetrics, pinnedNames, refMap]);

  // Derive active metrics based on filter
  const activeMetrics = useMemo(() => {
    if (filter === "notable") return notableMetrics;
    if (filter === "custom") {
      return chartMetrics.filter((t) => pinnedNames.includes(t.name));
    }
    return chartMetrics; // "all"
  }, [filter, notableMetrics, chartMetrics, pinnedNames]);

  // Merge all ISO dates across active metrics
  const mergedDates = useMemo<string[]>(() => {
    const s = new Set<string>();
    activeMetrics.forEach((t) =>
      t.data.forEach((p) => {
        if (p.date) s.add(p.date);
      })
    );
    return [...s].sort();
  }, [activeMetrics]);

  const Y_MIN = -0.35;
  const Y_MAX = 1.35;
  const CLAMP_MIN = Y_MIN + 0.04;
  const CLAMP_MAX = Y_MAX - 0.04;

  // Build flat chart rows — clamp normalized values to stay within Y domain
  const chartData = useMemo<ChartRow[]>(() => {
    return mergedDates.map((iso) => {
      const row: ChartRow = { date: iso, displayDate: formatDisplayDate(iso) };
      activeMetrics.forEach((t) => {
        const ref = refMap[t.name]!;
        const pt = t.data.find((p) => p.date === iso);
        const val = pt?.value ?? null;
        if (val !== null) {
          const raw = normalizeValue(val, ref.low, ref.high);
          row[`${t.name}_norm`] = Math.min(Math.max(raw, CLAMP_MIN), CLAMP_MAX);
          row[`${t.name}_actual`] = val;
          row[`${t.name}_status`] = raw < -0.05 ? "low" : raw > 1.05 ? "high" : "ok";
        } else {
          row[`${t.name}_norm`] = null;
          row[`${t.name}_actual`] = null;
          row[`${t.name}_status`] = "ok";
        }
      });
      return row;
    });
  }, [mergedDates, activeMetrics, refMap]);

  // Latest readings for gauge bars
  const latestValues = useMemo(() => {
    return activeMetrics.map((t) => {
      const sorted = t.data
        .filter((p) => p.value !== null)
        .sort((a, b) => b.date.localeCompare(a.date));
      return {
        name: t.name,
        value: sorted[0]?.value ?? null,
        date: sorted[0]?.date ?? "",
      };
    });
  }, [activeMetrics]);

  const toggle = (name: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });

  const toggleCollapsed = (id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (!chartMetrics.length) return null;

  const hasAngledLabels = mergedDates.length > 6;
  // XAxis height must be enough to render angled labels without clipping
  const xAxisHeight = hasAngledLabels ? 56 : 28;

  // Dynamic chart height — capped so the card stays within one screen view
  const chartHeight = Math.min(
    Math.max(200, activeMetrics.length * 40 + 60) + xAxisHeight,
    320
  );

  // Margins: generous left/right so angled labels aren't clipped
  const chartMargin = {
    left: hasAngledLabels ? 44 : 20,
    right: 28,
    top: 12,
    bottom: 4, // Recharts adds xAxisHeight on top of bottom margin
  };

  // Show only first 8 metrics in chart
  const chartMetricsToDisplay = activeMetrics.slice(0, 8);
  const showMetricLimit = activeMetrics.length > 8;

  // For gauge cards: show only first 6, prioritizing out-of-range
  const outOfRangeMetrics = latestValues
    .filter((v) => {
      if (v.value === null) return false;
      const ref = refMap[v.name];
      if (!ref) return false;
      const norm = normalizeValue(v.value, ref.low, ref.high);
      return norm < -0.02 || norm > 1.02;
    })
    .slice(0, 6);

  const gaugeMetricsToDisplay = [
    ...outOfRangeMetrics,
    ...latestValues
      .filter((v) => !outOfRangeMetrics.some((o) => o.name === v.name))
      .slice(0, 6 - outOfRangeMetrics.length),
  ].slice(0, 6);

  return (
    <>
        {/* header + divider (matches other dashboard cards) */}
        <div className="border-b border-[var(--border)] p-5">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Health trends</h2>
                <p className="text-xs text-[var(--muted)] mt-0.5 max-w-xl">
                  Showing metrics that need attention or are changing. Pin any to
                  always keep it here.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge>
                  {notableMetrics.length} notable / {chartMetrics.length} total
                </Badge>
              </div>
            </div>

            {/* filter pills: Concerning + All; Manage opens pins (custom / pinned view) */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {(["notable", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFilter(f);
                    setManageOpen(false);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filter === f
                      ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                      : "border border-[var(--border)] text-[var(--fg)] hover:bg-[var(--panel-2)]"
                  }`}
                >
                  {f === "notable" ? "Concerning" : "All changes"}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setManageOpen((o) => !o)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  manageOpen || (filter === "custom" && pinnedNames.length > 0)
                    ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                    : "border border-[var(--border)] text-[var(--fg)] hover:bg-[var(--panel-2)]"
                }`}
              >
                Manage
              </button>
            </div>
          </div>
        </div>

        {/* ── manage metrics panel (inline, not a separate card) ── */}
        {manageOpen && (
          <div className="border-b border-[var(--border)]">
            <ManageMetricsPanel
              allMetrics={chartMetrics.map((t) => t.name)}
              pinnedNames={pinnedNames}
              onPinToggle={onPinToggle}
              onClose={() => {
                setManageOpen(false);
                if (pinnedNames.length > 0) setFilter("custom");
              }}
              searchQuery={manageSearch}
              onSearchChange={setManageSearch}
            />
          </div>
        )}

        {/* ── chart ── */}
        {activeMetrics.length > 0 && (
        <CardContent className="p-4 overflow-visible">
            {!ready ? (
              <div className="h-64 rounded-2xl border border-dashed border-[var(--border)] animate-pulse bg-[var(--panel-2)]" />
            ) : (
              <>
                {/* overflow: visible so angled x-axis labels are never clipped */}
                <div className="min-h-0 min-w-0 w-full" style={{ overflow: "visible" }}>
                  <ResponsiveContainer
                    width="100%"
                    height={chartHeight}
                    minWidth={0}
                    minHeight={Math.max(chartHeight, 120)}
                  >
                    <LineChart
                      data={chartData}
                      margin={chartMargin}
                    >
                      {/* Single bottom axis line only — no grid lines */}

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
                        axisLine={{ stroke: "var(--border)", strokeWidth: 1 }}
                        tick={{ fill: "var(--muted)", fontSize: 11 }}
                        interval={0}
                        angle={hasAngledLabels ? -35 : 0}
                        textAnchor={hasAngledLabels ? "end" : "middle"}
                        height={xAxisHeight}
                        padding={{ left: 10, right: 10 }}
                      />
                      <YAxis hide domain={[-0.35, 1.35]} />

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

                      {chartMetricsToDisplay.map((t, i) => (
                        <Line
                          key={t.name}
                          dataKey={`${t.name}_norm`}
                          name={t.name}
                          stroke={PALETTE[i % PALETTE.length]}
                          strokeWidth={2}
                          dot={<OutOfRangeDot fill={PALETTE[i % PALETTE.length]} />}
                          activeDot={{ r: 5.5 }}
                          connectNulls={false}
                          type="monotone"
                          hide={hidden.has(t.name)}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* ── legend: small screens only (desktop relies on chart colours / tooltips) ── */}
                <div className="pt-2">
                  {showMetricLimit && (
                    <p className="text-xs text-[var(--muted)] text-center mb-2">
                      Showing 8 of {activeMetrics.length} — use filter to narrow
                      down
                    </p>
                  )}

                  <div className="flex justify-center md:hidden">
                    <button
                      type="button"
                      onClick={() => setMobileLegendOpen((v) => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] text-[10px] text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
                    >
                      <Menu className="h-3.5 w-3.5" />
                      Legend
                    </button>
                  </div>
                  {mobileLegendOpen && (
                    <div className="md:hidden mt-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-[var(--fg)]">Chart legend</p>
                        <button
                          type="button"
                          onClick={() => setMobileLegendOpen(false)}
                          className="p-1 hover:bg-[var(--panel-2)] rounded-lg transition-colors"
                        >
                          <XIcon className="h-3.5 w-3.5 text-[var(--muted)]" />
                        </button>
                      </div>
                      {chartMetricsToDisplay.length > 3 && (
                        <div className="flex justify-center gap-3 mb-2">
                          <button
                            type="button"
                            onClick={() => setHidden(new Set())}
                            className="text-[10px] text-[var(--accent)] hover:underline"
                          >
                            Show all
                          </button>
                          <span className="text-[var(--border)]">·</span>
                          <button
                            type="button"
                            onClick={() =>
                              setHidden(
                                new Set(chartMetricsToDisplay.map((t) => t.name))
                              )
                            }
                            className="text-[10px] text-[var(--accent)] hover:underline"
                          >
                            Hide all
                          </button>
                        </div>
                      )}
                      <ChartLegend
                        metrics={chartMetricsToDisplay.map((t) => t.name)}
                        colors={PALETTE}
                        hidden={hidden}
                        onToggle={toggle}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        )}
    </>
  );
}

// ─── CBC Overview Component ──────────────────────────────────────────────

function CBCOverview({
  latestValues,
  refMap,
}: {
  latestValues: Array<{ name: string; value: number | null; date: string }>;
  refMap: Record<string, RefRange | null>;
}) {
  const CBC_METRICS = [
    "Hemoglobin",
    "RBC",
    "WBC",
    "Platelets",
    "Neutrophils",
    "Lymphocytes",
  ];
  const cbcData = latestValues
    .filter((v) => CBC_METRICS.includes(v.name) && v.value !== null)
    .map((v) => {
      const ref = refMap[v.name];
      const norm = ref ? normalizeValue(v.value!, ref.low, ref.high) : 0.5;
      return {
        name: getLabMeta(v.name)?.friendlyName ?? v.name,
        value: v.value!,
        norm: Math.min(Math.max(norm, 0), 1),
        ref,
      };
    });

  if (cbcData.length === 0) return null;

  return (
    <div className="space-y-3">
      {cbcData.map((item, idx) => {
        const statusColor =
          item.norm < -0.05
            ? "#3b82f6"
            : item.norm > 1.05
              ? "#f59e0b"
              : "#22c55e";
        return (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[var(--fg)] font-medium">{item.name}</span>
              <span className="text-[var(--muted)]">
                {fmtNum(item.value)} {item.ref?.unit}
              </span>
            </div>
            <div className="relative h-1.5 rounded-full overflow-hidden bg-[var(--panel-2)]">
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${Math.min(Math.max(item.norm * 100, 0), 100)}%`,
                  background: statusColor,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Blood count card wrapper ────────────────────────────────────────────────

type LatestRefProps = {
  latestValues: Array<{ name: string; value: number | null; date: string }>;
  refMap: Record<string, RefRange | null>;
};

function CBCOverviewCard(props: LatestRefProps) {
  const CBC_METRICS = ["Hemoglobin", "RBC", "WBC", "Platelets", "Neutrophils", "Lymphocytes"];
  const cbcCount = props.latestValues.filter(
    (v) => CBC_METRICS.includes(v.name) && v.value !== null
  ).length;
  // A single isolated CBC value is rarely useful next to full panels — need at least two lines
  if (cbcCount < 2) return null;

  return (
    <Card className="min-w-0">
      <div className="px-5 py-3">
        <h3 className="text-sm font-semibold text-[var(--fg)]">Blood count</h3>
      </div>
      <CardContent className="min-w-0 pt-0">
        <CBCOverview {...props} />
      </CardContent>
    </Card>
  );
}
