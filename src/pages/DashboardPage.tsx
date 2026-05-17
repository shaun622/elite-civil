import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/layout/Header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />

      <main className="container py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back{user?.email ? `, ${user.email}` : ""}.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">No projects yet</CardTitle>
            <CardDescription>
              Projects, drawing uploads, and AI extraction land in the next
              step. For now this confirms the auth flow is wired up end-to-end.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Your project list will appear here.
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
