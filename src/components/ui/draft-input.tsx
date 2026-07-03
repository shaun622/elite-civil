import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Text/number inputs that buffer keystrokes locally and commit on blur (and
 * Enter, for the single-line variant). This avoids the "scrambled typing" bug
 * that happens when an input's `value` is bound to async server state and every
 * keystroke writes straight through an async update: the value reverts before
 * the write lands, the cursor jumps to the start, and text comes out reversed.
 *
 * `value` is the source of truth (may lag the DB round-trip); `onCommit` fires
 * once with the final text when the user leaves the field or presses Enter. The
 * local draft re-syncs from `value` whenever it changes while the field isn't
 * focused, so external updates still show through.
 */
type DraftInputProps = Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange"
> & {
  value: string;
  onCommit: (value: string) => void;
};

export const DraftInput = forwardRef<HTMLInputElement, DraftInputProps>(
  function DraftInput(
    { value, onCommit, onKeyDown, onBlur, onFocus, ...rest },
    ref,
  ) {
    const [draft, setDraft] = useState(value);
    const focused = useRef(false);

    useEffect(() => {
      if (!focused.current) setDraft(value);
    }, [value]);

    return (
      <Input
        ref={ref}
        {...rest}
        value={draft}
        onFocus={(e) => {
          focused.current = true;
          onFocus?.(e);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          focused.current = false;
          if (draft !== value) onCommit(draft);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          onKeyDown?.(e);
        }}
      />
    );
  },
);

type DraftTextareaProps = Omit<
  ComponentProps<typeof Textarea>,
  "value" | "onChange"
> & {
  value: string;
  onCommit: (value: string) => void;
};

export const DraftTextarea = forwardRef<HTMLTextAreaElement, DraftTextareaProps>(
  function DraftTextarea(
    { value, onCommit, onBlur, onFocus, ...rest },
    ref,
  ) {
    const [draft, setDraft] = useState(value);
    const focused = useRef(false);

    useEffect(() => {
      if (!focused.current) setDraft(value);
    }, [value]);

    return (
      <Textarea
        ref={ref}
        {...rest}
        value={draft}
        onFocus={(e) => {
          focused.current = true;
          onFocus?.(e);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          focused.current = false;
          if (draft !== value) onCommit(draft);
          onBlur?.(e);
        }}
      />
    );
  },
);
