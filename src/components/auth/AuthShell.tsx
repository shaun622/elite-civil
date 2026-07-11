import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";

const POINTS = [
  "Measure walls straight off the PDF",
  "Price with your own rates, crews and materials",
  "Send a client-ready quote the same day",
];

/**
 * Split-screen auth layout: the form on the left, the Elite Civil brand
 * panel (gradient, value points, mock quote card) on the right. The brand
 * panel hides below lg so phones get a clean single-column form.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Form side */}
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link to="/" className="flex items-center gap-2">
          <span className="bg-brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-bold text-white shadow-sm">
            EC
          </span>
          <span className="font-semibold tracking-tight">Elite Civil</span>
        </Link>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {subtitle && (
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
            {children}
            {footer}
          </div>
        </div>
      </div>

      {/* Brand side */}
      <div className="bg-brand-gradient relative hidden overflow-hidden lg:flex lg:items-center lg:justify-center">
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-sky-200/20 blur-3xl" />

        <div className="relative max-w-md px-10 text-white">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            From civil drawings to a priced retaining wall quote in minutes.
          </h2>

          <ul className="mt-8 space-y-3">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-inset ring-white/30">
                  <Check className="h-3 w-3" />
                </span>
                <span className="text-sky-50">{point}</span>
              </li>
            ))}
          </ul>

          {/* Mock quote card */}
          <div className="mt-10 rounded-xl bg-white p-5 text-foreground shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Quotation
                </p>
                <p className="text-sm font-semibold">Riverbend Rise Stage 2</p>
              </div>
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-semibold text-sky-700">
                Ready to send
              </span>
            </div>
            <div className="mt-4 space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Sleeper walls, 0 to 1.6 m</span>
                <span className="tabular-nums">$96,410</span>
              </div>
              <div className="flex justify-between">
                <span>Sleeper walls, 1.6 to 2.2 m</span>
                <span className="tabular-nums">$118,260</span>
              </div>
              <div className="flex justify-between">
                <span>Extra over, upper tier walls</span>
                <span className="tabular-nums">$34,060</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-sm font-semibold text-foreground">
                <span>Total ex GST</span>
                <span className="tabular-nums text-blue-700">$248,730</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
