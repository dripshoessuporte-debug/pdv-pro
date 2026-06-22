import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Orders from "@/pages/orders";
import NewOrder from "@/pages/new-order";
import OrderDetail from "@/pages/order-detail";
import Tables from "@/pages/tables";
import Kitchen from "@/pages/kitchen";
import Menu from "@/pages/menu";
import Customers from "@/pages/customers";
import Payment from "@/pages/payment";
import Cash from "@/pages/cash";
import Routes from "@/pages/routes";
import Motoboys from "@/pages/motoboys";
import SettingsPage from "@/pages/settings";
import OpenRouteServiceSettingsPage from "@/pages/openrouteservice-settings";
import TeamPage from "@/pages/team";
import FiscalPage from "@/pages/fiscal";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import CreateStorePage from "@/pages/create-store";
import PlansPage from "@/pages/plans";
import ActivatePage from "@/pages/activate";
import OnboardingPage from "@/pages/onboarding";
import AdminMaxLoginPage from "@/pages/admin-max-login";
import { AdminMaxUsersPage } from "@/pages/admin-max-users";
import {
  AdminMaxBillingPage,
  AdminMaxDashboardPage,
  AdminMaxLogsPage,
  AdminMaxStoresPage,
  AdminMaxSupportPage,
  AdminMaxSystemsPage,
} from "@/pages/admin-max";
import { AuthProvider, hasStoreCreationAccess, useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/protected-route";
import { ProtectedPlatformRoute } from "@/components/protected-platform-route";
import { defaultPathForRole } from "@/lib/rbac";

const queryClient = new QueryClient();

function HomeRedirect() {
  const { actor, entitlement, isAuthenticated, isLoading, platformRole } =
    useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Carregando sessão...
      </div>
    );
  }

  if (!isAuthenticated) return <Redirect to="/login" />;
  if (platformRole && !actor) return <Redirect to="/admin-max" />;
  if (!actor)
    return (
      <Redirect
        to={hasStoreCreationAccess(entitlement) ? "/create-store" : "/plans"}
      />
    );

  return <Redirect to={defaultPathForRole(actor.role)} />;
}

function SupportModeBanner() {
  const [session, setSession] = useState<any | null>(null);
  useEffect(() => {
    fetch("/api/platform/support/current", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSession(data?.active ? data.session : null))
      .catch(() => setSession(null));
  }, []);
  if (!session) return null;
  async function endSupport() {
    await fetch("/api/platform/support/end", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    window.location.href = "/admin-max/stores";
  }
  return (
    <div className="sticky top-0 z-50 border-b border-amber-300/30 bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <span>
          SUPORTE · Modo Suporte ativo — Loja: {session.storeName}. Todas as
          ações estão sendo registradas. Modo:{" "}
          {session.mode === "read_only"
            ? "Somente leitura"
            : "Acesso com edição"}
        </span>
        <Button
          size="sm"
          className="bg-slate-950 text-white hover:bg-slate-800"
          onClick={() => void endSupport()}
        >
          Encerrar suporte
        </Button>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/admin-max/login" component={AdminMaxLoginPage} />
      <Route path="/plans" component={PlansPage} />
      <Route path="/request-access" component={RegisterPage} />
      <Route path="/activate/:token" component={ActivatePage} />
      <Route path="/create-store" component={CreateStorePage} />
      <Route path="/onboarding">
        {() => (
          <ProtectedRoute path="/onboarding">
            <OnboardingPage />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin-max/systems">
        {() => (
          <ProtectedPlatformRoute>
            <AdminMaxSystemsPage />
          </ProtectedPlatformRoute>
        )}
      </Route>
      <Route path="/admin-max/support">
        {() => (
          <ProtectedPlatformRoute>
            <AdminMaxSupportPage />
          </ProtectedPlatformRoute>
        )}
      </Route>
      <Route path="/admin-max/logs">
        {() => (
          <ProtectedPlatformRoute>
            <AdminMaxLogsPage />
          </ProtectedPlatformRoute>
        )}
      </Route>
      <Route path="/admin-max/billing">
        {() => (
          <ProtectedPlatformRoute>
            <AdminMaxBillingPage />
          </ProtectedPlatformRoute>
        )}
      </Route>
      <Route path="/admin-max/stores">
        {() => (
          <ProtectedPlatformRoute>
            <AdminMaxStoresPage />
          </ProtectedPlatformRoute>
        )}
      </Route>
      <Route path="/admin-max/users">
        {() => (
          <ProtectedPlatformRoute>
            <AdminMaxUsersPage />
          </ProtectedPlatformRoute>
        )}
      </Route>
      <Route path="/admin-max">
        {() => (
          <ProtectedPlatformRoute>
            <AdminMaxDashboardPage />
          </ProtectedPlatformRoute>
        )}
      </Route>
      <Route path="/">{() => <HomeRedirect />}</Route>
      <Route path="/dashboard">
        {() => (
          <ProtectedRoute path="/dashboard">
            <Dashboard />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/orders/new">
        {() => (
          <ProtectedRoute path="/orders/new">
            <NewOrder />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/orders/:id">
        {() => (
          <ProtectedRoute path="/orders">
            <OrderDetail />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/orders">
        {() => (
          <ProtectedRoute path="/orders">
            <Orders />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/tables">
        {() => (
          <ProtectedRoute path="/tables">
            <Tables />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/kitchen">
        {() => (
          <ProtectedRoute path="/kitchen">
            <Kitchen />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/menu">
        {() => (
          <ProtectedRoute path="/menu">
            <Menu />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/customers">
        {() => (
          <ProtectedRoute path="/customers">
            <Customers />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/payments/:orderId">
        {() => (
          <ProtectedRoute path="/payments">
            <Payment />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/cash">
        {() => (
          <ProtectedRoute path="/cash">
            <Cash />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/routes">
        {() => (
          <ProtectedRoute path="/routes">
            <Routes />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/motoboys">
        {() => (
          <ProtectedRoute path="/motoboys">
            <Motoboys />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/fiscal">
        {() => (
          <ProtectedRoute path="/fiscal">
            <FiscalPage />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/openrouteservice">
        {() => <Redirect to="/settings/openrouteservice" />}
      </Route>
      <Route path="/settings/openrouteservice">
        {() => (
          <ProtectedRoute path="/settings">
            <OpenRouteServiceSettingsPage />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/settings">
        {() => (
          <ProtectedRoute path="/settings">
            <SettingsPage />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/team">
        {() => (
          <ProtectedRoute path="/team">
            <TeamPage />
          </ProtectedRoute>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <SupportModeBanner />
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
