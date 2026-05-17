import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function WarningsPanel({ warnings }: { warnings: string[] }) {
  const [open, setOpen] = useState(true);
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-md border border-red-200 bg-red-50/60 text-red-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium"
      >
        <span className="inline-flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {warnings.length} warning{warnings.length === 1 ? "" : "s"} from extraction
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {open && (
        <ul className={cn("space-y-1.5 px-4 pb-3 text-xs leading-relaxed")}>
          {warnings.map((w, i) => (
            <li key={i} className="list-disc">
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
