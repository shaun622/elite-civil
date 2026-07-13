/**
 * True on touch / pen devices (a "coarse" primary pointer): phones and iPads.
 * Used to enlarge canvas hit targets so fingers can grab wall endpoints. The
 * pointer class doesn't change within a session, so a module-level constant is
 * enough — no hook / re-render needed.
 */
export const isCoarsePointer =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;
