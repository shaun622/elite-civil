/**
 * The mock site plan: lots, colour-coded walls, badges and RLs. Pure SVG so
 * it scales crisply and prints the exact brand colours. Shared between the
 * marketing landing page and the onboarding virtual tour.
 */
export function PlanDrawing({
  className,
  gridId = "lp-grid",
}: {
  className?: string;
  /** Unique per instance: the SVG can render more than once on a page and
   *  duplicate pattern ids are invalid HTML. */
  gridId?: string;
}) {
  return (
    <svg
      viewBox="0 0 640 400"
      className={className}
      role="img"
      aria-label="Site plan with retaining walls colour coded by height band"
    >
      <defs>
        <pattern id={gridId} width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e5edf5" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width="640" height="400" fill="#f8fafc" />
      <rect width="640" height="400" fill={`url(#${gridId})`} />

      {/* Lot boundaries */}
      <g fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="6 5">
        <rect x="60" y="52" width="180" height="176" />
        <rect x="240" y="52" width="200" height="176" />
        <rect x="440" y="52" width="140" height="176" />
        <line x1="60" y1="290" x2="580" y2="290" />
      </g>

      {/* Lot labels */}
      <g fill="#94a3b8" fontSize="11" fontWeight="600" textAnchor="middle">
        <text x="150" y="130">LOT 14</text>
        <text x="340" y="130">LOT 15</text>
        <text x="510" y="130">LOT 16</text>
      </g>
      <g fill="#b6c2d2" fontSize="10" textAnchor="middle">
        <text x="320" y="316">MURRAY PARADE</text>
      </g>

      {/* Walls, colour coded by height band */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="62,228 238,228" stroke="#0ea5e9" strokeWidth="6" />
        <polyline points="244,228 438,228" stroke="#10b981" strokeWidth="6" />
        <polyline points="440,226 440,54" stroke="#f59e0b" strokeWidth="6" />
        <polyline points="60,226 60,110" stroke="#0ea5e9" strokeWidth="6" />
      </g>

      {/* Selection halo on the emerald wall */}
      <rect
        x="236"
        y="217"
        width="212"
        height="22"
        rx="11"
        fill="none"
        stroke="#10b981"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        opacity="0.65"
      />

      {/* RL markers */}
      <g>
        <circle cx="62" cy="228" r="3.5" fill="#1d4ed8" />
        <text x="70" y="248" fontSize="9" fill="#64748b">RL 21.45</text>
        <circle cx="438" cy="228" r="3.5" fill="#1d4ed8" />
        <text x="392" y="248" fontSize="9" fill="#64748b">RL 22.60</text>
      </g>

      {/* Wall badges */}
      <WallBadge x={92} y={196} dot="#0ea5e9" text="18.6 m · 1.2 m H" />
      <WallBadge x={286} y={196} dot="#10b981" text="16.2 m · 1.8 m H" />
      <WallBadge x={452} y={126} dot="#f59e0b" text="9.4 m · 2.4 m H" />

      {/* Selected wall tooltip card */}
      <g>
        <rect x="268" y="248" width="150" height="58" rx="10" fill="#ffffff" stroke="#e2e8f0" />
        <rect x="268" y="248" width="150" height="58" rx="10" fill="none" stroke="#0f172a" strokeOpacity="0.04" />
        <text x="282" y="268" fontSize="10" fontWeight="700" fill="#0f172a">
          Wall B2 · Lot 15
        </text>
        <text x="282" y="283" fontSize="9" fill="#64748b">
          16.2 m long · 1.8 m high
        </text>
        <text x="282" y="297" fontSize="9" fill="#0284c7" fontWeight="600">
          Super Sleeper · 29.2 m²
        </text>
      </g>

      {/* North arrow + scale */}
      <g>
        <circle cx="596" cy="358" r="14" fill="#ffffff" stroke="#e2e8f0" />
        <path d="M 596 349 L 601 364 L 596 360.5 L 591 364 Z" fill="#475569" />
        <text x="596" y="388" fontSize="8" fill="#94a3b8" textAnchor="middle">N</text>
      </g>
      <text x="60" y="382" fontSize="9" fill="#94a3b8">SCALE 1:200</text>
    </svg>
  );
}

export function WallBadge({
  x,
  y,
  dot,
  text,
}: {
  x: number;
  y: number;
  dot: string;
  text: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width="112" height="22" rx="11" fill="#ffffff" stroke="#e2e8f0" />
      <circle cx={x + 13} cy={y + 11} r="4" fill={dot} />
      <text x={x + 24} y={y + 15} fontSize="10" fontWeight="600" fill="#334155">
        {text}
      </text>
    </g>
  );
}
