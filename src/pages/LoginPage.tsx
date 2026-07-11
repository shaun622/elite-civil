import { Link } from "react-router-dom";
import { LoginForm } from "@/components/auth/LoginForm";
import { AuthShell } from "@/components/auth/AuthShell";

export function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your Elite Civil account."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          New to Elite Civil?{" "}
          <Link
            to="/signup"
            className="font-medium text-primary hover:underline"
          >
            Create an account
          </Link>
        </p>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
