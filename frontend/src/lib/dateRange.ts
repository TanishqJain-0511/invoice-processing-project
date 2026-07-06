export type DateRangePreset = "all" | "today" | "7d" | "30d" | "90d" | "custom";

export interface DateRangeValue {
  preset: DateRangePreset;
  from?: string; // ISO yyyy-mm-dd, only for "custom"
  to?: string; // ISO yyyy-mm-dd, only for "custom"
}

export const DEFAULT_DATE_RANGE: DateRangeValue = { preset: "all" };

export const DATE_RANGE_LABELS: Record<DateRangePreset, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  custom: "Custom range",
};

export function isWithinDateRange(iso: string, range: DateRangeValue): boolean {
  if (range.preset === "all") return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;

  if (range.preset === "custom") {
    if (range.from && t < new Date(range.from).getTime()) return false;
    if (range.to && t > new Date(range.to).getTime() + 24 * 60 * 60 * 1000 - 1) return false;
    return true;
  }

  const days = { today: 1, "7d": 7, "30d": 30, "90d": 90 }[range.preset];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return t >= cutoff;
}

/** Encode a date range into URL search params so it can be carried between pages. */
export function dateRangeToParams(range: DateRangeValue): URLSearchParams {
  const params = new URLSearchParams();
  params.set("range", range.preset);
  if (range.preset === "custom") {
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
  }
  return params;
}

export function dateRangeFromParams(params: URLSearchParams): DateRangeValue {
  const preset = params.get("range") as DateRangePreset | null;
  if (!preset || !(preset in DATE_RANGE_LABELS)) return DEFAULT_DATE_RANGE;
  return {
    preset,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  };
}