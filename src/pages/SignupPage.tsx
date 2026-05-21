import { Link } from "react-router-dom";
import { SignupForm } from "@/components/auth/SignupForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SignupPage() {
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
            <CardTitle className="text-xl">Create your account</CardTitle>
          </CardHeader>
          <CardContent>
            <SignupForm />
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          3 free drawings · No card required
        </p>
      </div>
    </div>
  );
}
