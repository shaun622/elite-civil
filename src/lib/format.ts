/**
 * Format a length stored in millimetres for display. Always rendered in
 * metres so length / height / thickness never mix units. Up to 3 decimal
 * places (millimetre precision), trailing zeros trimmed.
 *
 *   formatLength(28000)  → "28 m"
 *   formatLength(750)    → "0.75 m"
 *   formatLength(2455)   → "2.455 m"
 *   formatLength(200)    → "0.2 m"
 *   formatLength(null)   → "—"
 */
export function formatLength(mm: number | null | undefined): string {
  if (mm === null || mm === undefined || !Number.isFinite(mm)) return "—";
  const m = mm / 1000;
  let text = m.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  if (text === "" || text === "-" || text === "-0") text = "0";
  return `${text} m`;
}

/**
 * Parse a length string into millimetres. Input is interpreted as metres
 * by default (matching the display); append "mm" to enter millimetres.
 *   "1.5"       → 1500
 *   "28"        → 28000
 *   "1.5 m"     → 1500
 *   "750 mm"    → 750
 *   ""          → null
 */
export function parseLength(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(mm|m)?$/);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return null;
  if (match[2] === "mm") return Math.round(num);
  // No suffix or explicit "m" → metres.
  return Math.round(num * 1000);
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 1000 * 60 * 60 * 24 * 365],
  ["month", 1000 * 60 * 60 * 24 * 30],
  ["week", 1000 * 60 * 60 * 24 * 7],
  ["day", 1000 * 60 * 60 * 24],
  ["hour", 1000 * 60 * 60],
  ["minute", 1000 * 60],
  ["second", 1000],
];

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = then - Date.now();
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === "second") {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return "";
}
