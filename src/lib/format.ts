/**
 * Format a length stored in millimetres for display. Values ≥ 1m get
 * rendered as metres with 2 decimals; smaller values stay as mm.
 *
 *   formatLength(28000)  → "28 m"
 *   formatLength(750)    → "750 mm"
 *   formatLength(1500)   → "1.5 m"
 *   formatLength(null)   → "—"
 */
export function formatLength(mm: number | null | undefined): string {
  if (mm === null || mm === undefined || !Number.isFinite(mm)) return "—";
  if (Math.abs(mm) >= 1000) {
    const m = mm / 1000;
    // Trim trailing zeros (28.00 → 28, 1.50 → 1.5)
    const text = Number.isInteger(m) ? String(m) : m.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return `${text} m`;
  }
  return `${mm} mm`;
}

/**
 * Parse a length string into millimetres. Accepts:
 *   "1500"      → 1500
 *   "1500 mm"   → 1500
 *   "1.5"       → 1500  (interpreted as metres because of the decimal)
 *   "1.5 m"     → 1500
 *   "28 m"      → 28000
 *   ""          → null
 */
export function parseLength(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(mm|m)?$/);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return null;
  const unit = match[2];
  if (unit === "m") return Math.round(num * 1000);
  if (unit === "mm") return Math.round(num);
  // No suffix — decimal numbers are interpreted as metres, integers as mm.
  return match[1].includes(".") ? Math.round(num * 1000) : Math.round(num);
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
