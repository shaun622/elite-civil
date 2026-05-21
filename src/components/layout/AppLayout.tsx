import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { AppSidebar } from "./AppSidebar";

/**
 * Top-level shell for every signed-in page: top Header, persistent
 * sidebar on the left, child route content on the right.
 */
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <Header />
      <div className="flex flex-1">
        <AppSidebar />
        <main className="min-w-0 flex-1 overflow-x-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
