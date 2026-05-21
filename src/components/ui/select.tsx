/* ============================================================
 * Lightweight Select — exposes the shadcn/Radix-shaped API the
 * ported BE Landscapes pages use, but renders as a native HTML
 * <select> under the hood. No extra dependency, no Tailwind v4
 * data-attribute soup, and screen readers / keyboard nav come
 * for free from the platform.
 *
 * The Radix-style API is collected on the root <Select> via the
 * React-context-free pattern of cloning children: <SelectTrigger>
 * and <SelectContent> simply render their children inside the
 * single underlying <select>. <SelectValue/> is a no-op rendered
 * for API compat — the native select element shows the selected
 * option's text on its own.
 * ============================================================ */

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

type SelectContextValue = {
  value?: string;
  onValueChange?: (value: string) => void;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}

/**
 * `<Select>` collects a trigger child (className/size) and a content
 * child (the `<SelectItem>` options) and renders them as one native
 * `<select>`. Items become `<option>` elements at render time.
 */
export function Select({
  value,
  defaultValue,
  onValueChange,
  children,
  disabled,
}: SelectProps) {
  const ctx: SelectContextValue = { value, onValueChange };

  // Pull className from <SelectTrigger> and items from <SelectContent>.
  let triggerClassName = "";
  let triggerProps: React.HTMLAttributes<HTMLSelectElement> = {};
  const items: React.ReactNode[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === SelectTrigger) {
      const p = child.props as React.HTMLAttributes<HTMLDivElement> & {
        className?: string;
      };
      triggerClassName = p.className ?? "";
      const { className: _, children: __, ...rest } = p;
      void _;
      void __;
      triggerProps = rest as React.HTMLAttributes<HTMLSelectElement>;
    } else if (child.type === SelectContent) {
      const p = child.props as { children?: React.ReactNode };
      React.Children.forEach(p.children, (item) => items.push(item));
    }
  });

  const baseClass =
    "flex h-9 w-full appearance-none rounded-md border border-input bg-transparent px-3 py-1 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <SelectContext.Provider value={ctx}>
      <div className={cn("relative", triggerClassName.includes("w-") ? "" : "")}>
        <select
          {...triggerProps}
          className={cn(baseClass, triggerClassName)}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          onChange={(e) => onValueChange?.(e.target.value)}
        >
          {items}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </SelectContext.Provider>
  );
}

/**
 * Carries className/size through to the underlying native select.
 * Rendered indirectly by <Select> — does not render its own DOM.
 */
export function SelectTrigger(_props: {
  className?: string;
  size?: "sm" | "default";
  children?: React.ReactNode;
}) {
  // Children (typically <SelectValue/>) are discarded — the native
  // select shows the selected option text itself.
  return null;
}

/**
 * Placeholder for the selected value. The native select renders the
 * selected option's text automatically, so this is a no-op kept for
 * API parity with the BE Landscapes pages.
 */
export function SelectValue(_props: { placeholder?: string }) {
  return null;
}

/** Wrapper for the option list — children are <SelectItem>s. */
export function SelectContent(_props: { children?: React.ReactNode }) {
  return null;
}

export interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export function SelectItem({ value, children, disabled }: SelectItemProps) {
  return (
    <option value={value} disabled={disabled}>
      {typeof children === "string" || typeof children === "number"
        ? children
        : value}
    </option>
  );
}
