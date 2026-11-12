import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { homePath, useAuth } from "@/hooks/useAuth";
import { Shell } from "@/components/Shell";
import { Spinner } from "@/components/ui";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import { FEATURES } from "@/lib/features";

const Quotes = lazy(() => import("@/pages/admin/Quotes"));
const QuotePrint = lazy(() => import("@/pages/QuotePrint"));
const Dashboard = lazy(() => import("@/pages/admin/Dashboard"));
const Projects = lazy(() => import("@/pages/admin/Projects"));
const ProjectDetail = lazy(() => import("@/pages/admin/ProjectDetail"));
const Audit = lazy(() => import("@/pages/admin/Audit"));
const Suppliers = lazy(() => import("@/pages/admin/Suppliers"));
const Finance = lazy(() => import("@/pages/admin/Finance"));
const Performance = lazy(() => import("@/pages/admin/Performance"));
const Team = lazy(() => import("@/pages/admin/Team"));
const Expenses = lazy(() => import("@/pages/admin/Expenses"));
const Payroll = lazy(() => import("@/pages/admin/Payroll"));
const Reports = lazy(() => import("@/pages/admin/Reports"));
const AttendanceAdmin = lazy(() => import("@/pages/admin/Attendance"));
const EngHome = lazy(() => import("@/pages/engineer/Home"));
const EngAttendance = lazy(() => import("@/pages/engineer/Attendance"));
const EngReport = lazy(() => import("@/pages/engineer/Report"));
const EngExpenses = lazy(() => import("@/pages/engineer/Expenses"));
const ClientHome = lazy(() => import("@/pages/client/Home"));
const ClientUpdates = lazy(() => import("@/pages/client/Updates"));
const ClientPayments = lazy(() => import("@/pages/client/Payments"));
const ClientRequests = lazy(() => import("@/pages/client/Requests"));
const ClientReport = lazy(() => import("@/pages/client/Report"));

/** Route guard. UI gating only: the real enforcement is Row Level Security in Postgres. */
function Guard({
  allow,
  children,
}: {
  allow: "manager" | "admin" | "engineer" | "client";
  children: ReactNode;
}) {
  const { session, profile, loading, isAdmin, isManager, signOut } = useAuth();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile || !profile.is_active) return <Navigate to="/login" replace />;
  // The client portal doesn't exist on plans without it, even for accounts that were created earlier.
  if (profile.role === "client" && !FEATURES.clientPortal) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl bg-card p-7 text-center shadow-xl">
          <h1 className="mb-2 text-lg font-black">الخدمة غير متاحة</h1>
          <p className="mb-4 text-sm leading-7 text-muted">
            بوابة العميل غير متاحة في باقة الشركة الحالية. تواصل مع الشركة
            للمتابعة.
          </p>
          <button
            onClick={() => void signOut()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }
  const home = homePath(profile.role);
  if (allow === "admin" && !isAdmin) return <Navigate to={home} replace />;
  if (allow === "manager" && !isManager) return <Navigate to={home} replace />;
  if (allow === "engineer" && profile.role !== "site_engineer")
    return <Navigate to={home} replace />;
  if (allow === "client" && profile.role !== "client")
    return <Navigate to={home} replace />;
  return <>{children}</>;
}

function Home() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!session || !profile) return <Navigate to="/login" replace />;
  return <Navigate to={homePath(profile.role)} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<Home />} />

        <Route
          path="/admin"
          element={
            <Guard allow="manager">
              <Shell />
            </Guard>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="reports" element={<Reports />} />
          <Route path="attendance" element={<AttendanceAdmin />} />
          <Route
            path="team"
            element={
              <Guard allow="admin">
                <Team />
              </Guard>
            }
          />
          <Route
            path="payroll"
            element={
              <Guard allow="admin">
                <Payroll />
              </Guard>
            }
          />
          <Route
            path="audit"
            element={
              <Guard allow="admin">
                <Audit />
              </Guard>
            }
          />
          {FEATURES.quotes && <Route path="quotes" element={<Quotes />} />}
          {FEATURES.suppliers && (
            <Route path="suppliers" element={<Suppliers />} />
          )}
          {FEATURES.finance && <Route path="finance" element={<Finance />} />}
          {FEATURES.performance && (
            <Route path="performance" element={<Performance />} />
          )}
        </Route>

        {FEATURES.quotes && (
          <Route
            path="/admin-print/quote/:id"
            element={
              <Guard allow="manager">
                <QuotePrint />
              </Guard>
            }
          />
        )}
        <Route
          path="/app"
          element={
            <Guard allow="engineer">
              <Shell />
            </Guard>
          }
        >
          <Route index element={<EngHome />} />
          <Route path="attendance" element={<EngAttendance />} />
          <Route path="report" element={<EngReport />} />
          <Route path="expenses" element={<EngExpenses />} />
        </Route>

        <Route
          path="/client"
          element={
            <Guard allow="client">
              <Shell />
            </Guard>
          }
        >
          <Route index element={<ClientHome />} />
          <Route path="updates" element={<ClientUpdates />} />
          <Route path="payments" element={<ClientPayments />} />
          <Route path="requests" element={<ClientRequests />} />
        </Route>
        <Route
          path="/client/report"
          element={
            <Guard allow="client">
              <ClientReport />
            </Guard>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
