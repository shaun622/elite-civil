import { useEffect } from "react";
import { useLocation, useParams } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { NavList } from "./NavList";

/**
 * The mobile / iPad-portrait navigation: the same NavList the desktop sidebar
 * shows, in a left slide-in sheet. Opened by the Header hamburger below `lg`.
 * We compose the Radix Dialog primitives directly (rather than the styled
 * DialogContent) so the sheet's position + slide animation are fully under our
 * control and don't fight the centred-modal base classes.
 */
export function MobileNavDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const params = useParams<{ id?: string; projectId?: string }>();
  const activeProjectId = params.id ?? params.projectId;
  const location = useLocation();

  // Close on any navigation (covers redirects that don't pass through a
  // NavList link's onNavigate). Harmless on mount / when already closed.
  useEffect(() => {
    onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-72 max-w-[85vw] flex-col border-r bg-card shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"
        >
          <DialogTitle className="sr-only">Navigation</DialogTitle>

          <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <div className="bg-brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white shadow-sm">
              EC
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Elite Civil</p>
              <p className="text-[10px] text-muted-foreground">
                Retaining Wall Estimator
              </p>
            </div>
            <DialogPrimitive.Close
              className="ml-auto rounded-sm p-1 text-muted-foreground opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          <nav className="flex-1 overflow-y-auto p-2">
            <NavList
              activeProjectId={activeProjectId}
              onNavigate={() => onOpenChange(false)}
            />
          </nav>

          <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-[10px] text-muted-foreground">
            <span>Elite Civil</span>
            <span className="tabular-nums" title="Build version">
              v{__APP_VERSION__}
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
