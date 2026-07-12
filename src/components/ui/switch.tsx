import { cn } from "@/lib/utils";

/**
 * A small animated toggle switch: a gradient pill track with a sliding thumb
 * that springs into place, plus a light haptic buzz on devices that support it
 * (Android Chrome; a silent no-op elsewhere). Used for the include/exclude
 * toggles across Pricing & Performance, Cost Breakdown and Materials Order.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  size = "default",
  title,
  className,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "default" | "sm";
  title?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const sm = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        // Web haptics: only fires inside this user gesture, no-ops if absent.
        navigator.vibrate?.(10);
        onCheckedChange(!checked);
      }}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100",
        sm ? "h-4 w-7" : "h-5 w-9",
        checked ? "bg-brand-gradient" : "bg-muted-foreground/25",
        disabled && "cursor-not-allowed opacity-40",
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none rounded-full bg-white shadow transition-transform duration-200 ease-[cubic-bezier(.2,1.4,.4,1)] active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100",
          sm ? "h-3 w-3" : "h-4 w-4",
          checked
            ? sm
              ? "translate-x-[14px]"
              : "translate-x-[18px]"
            : "translate-x-[2px]",
        )}
      />
    </button>
  );
}
