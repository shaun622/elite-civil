import { Link, useNavigate } from "react-router-dom";
import { LogOut, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export function Header() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    try {
      await signOut();
    } finally {
      navigate("/");
    }
  }

  return (
    <header className="border-b">
      <div className="container flex h-14 items-center justify-between">
        <Link to={user ? "/dashboard" : "/"} className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight">
            Elite Civil
          </span>
          <span className="text-xs text-muted-foreground">— TakeoffMate</span>
        </Link>

        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link
                to="/pricing"
                className="hidden text-muted-foreground hover:text-foreground sm:inline"
              >
                Pricing
              </Link>
              <Link
                to="/settings"
                className="hidden text-muted-foreground hover:text-foreground sm:inline-flex sm:items-center sm:gap-1"
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </Link>
              <span className="hidden text-muted-foreground sm:inline">·</span>
              <span className="hidden text-muted-foreground sm:inline">
                {user.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link
                to="/pricing"
                className="hidden text-muted-foreground hover:text-foreground sm:inline"
              >
                Pricing
              </Link>
              <Link
                to="/login"
                className="text-muted-foreground hover:text-foreground"
              >
                Sign in
              </Link>
              <Button asChild size="sm">
                <Link to="/signup">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
