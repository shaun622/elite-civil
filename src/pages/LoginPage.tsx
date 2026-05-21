import { Link } from "react-router-dom";
import { LoginForm } from "@/components/auth/LoginForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md space-y-6">
        <Link to="/" className="flex flex-col items-center gap-1 text-center">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            BE Landscapes
          </span>
          <span className="text-2xl font-semibold tracking-tight">
            Retaining Wall Estimator
          </span>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
