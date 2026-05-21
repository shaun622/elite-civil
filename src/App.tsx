import { Navigate, Route, Routes } from "react-router-dom";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { SignupPage } from "@/pages/SignupPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ProjectPage } from "@/pages/ProjectPage";
import { ProjectDashboardPage } from "@/pages/ProjectDashboardPage";
import { TakeOffPage } from "@/pages/TakeOffPage";
import { PricingPerfPage } from "@/pages/PricingPerfPage";
import { CostBreakdownPage } from "@/pages/CostBreakdownPage";
import { MaterialsOrderPage } from "@/pages/MaterialsOrderPage";
import { QuotationPage } from "@/pages/QuotationPage";
import { TrackingPage } from "@/pages/TrackingPage";
import { ProjectSettingsPage } from "@/pages/ProjectSettingsPage";
import { ReviewPage } from "@/pages/ReviewPage";
import { WallMeasurePage } from "@/pages/WallMeasurePage";
import { PricingPage } from "@/pages/PricingPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { VectorProbePage } from "@/pages/dev/VectorProbePage";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";

export function App() {
  return (
    <Routes>
      {/* Public marketing / auth */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/pricing" element={<PricingPage />} />

      {/* Signed-in app shell — Header + sidebar wrap every child route */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/settings" element={<SettingsPage />} />

        {/* Project-scoped — BE Landscapes nav lives under each project */}
        <Route path="/projects/:id" element={<ProjectDashboardPage />} />
        <Route path="/projects/:id/drawings" element={<ProjectPage />} />
        <Route path="/projects/:id/takeoff" element={<TakeOffPage />} />
        <Route path="/projects/:id/pricing" element={<PricingPerfPage />} />
        <Route
          path="/projects/:id/cost-breakdown"
          element={<CostBreakdownPage />}
        />
        <Route path="/projects/:id/materials" element={<MaterialsOrderPage />} />
        <Route path="/projects/:id/quotation" element={<QuotationPage />} />
        <Route path="/projects/:id/tracking" element={<TrackingPage />} />
        <Route path="/projects/:id/settings" element={<ProjectSettingsPage />} />

        {/* Existing measure / review flow */}
        <Route
          path="/projects/:projectId/pages/:pageId"
          element={<ReviewPage />}
        />
        <Route
          path="/projects/:projectId/pages/:pageId/measure"
          element={<WallMeasurePage />}
        />
      </Route>

      <Route path="/dev/vector-probe" element={<VectorProbePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
