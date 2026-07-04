import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { AppSidebar } from "./AppSidebar";

/**
 * Top-level shell for every signed-in page: top Header, persistent
 * sidebar on the left, child route content on the right.
 */
export function AppLayout() {
  return (
    // Fixed-height shell: the Header + sidebar stay put and the main content
    // scrolls internally. This (rather than a min-h-screen shell where the body
    // scrolls) is what lets pages use `position: sticky` — e.g. the Review map
    // staying in view while the wall list scrolls.
    <div className="flex h-screen flex-col bg-muted/20 print:block print:h-auto">
      <Header />
      <div className="flex min-h-0 flex-1 print:block">
        <AppSidebar />
        <main className="min-w-0 flex-1 overflow-auto print:overflow-visible">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
