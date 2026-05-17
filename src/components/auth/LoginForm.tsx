import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Mode = "password" | "magic";

export function LoginForm() {
  const navigate = useNavigate();
  const { signIn, signInWithMagicLink } = useAuth();

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "password") {
        await signIn(email, password);
        navigate("/dashboard");
      } else {
        await signInWithMagicLink(email);
        setMagicSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {magicSent && (
        <Alert>
          <AlertDescription>
            Check your inbox for a sign-in link.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {mode === "password" && (
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      )}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting
          ? "Signing in…"
          : mode === "password"
            ? "Sign in"
            : "Send magic link"}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "password" ? "magic" : "password");
            setError(null);
            setMagicSent(false);
          }}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {mode === "password" ? "Use magic link" : "Use password"}
        </button>
        <Link
          to="/signup"
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Create an account
        </Link>
      </div>
    </form>
  );
}
