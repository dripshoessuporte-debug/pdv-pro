import { useState } from "react";
import { Redirect } from "wouter";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authFetchJson, useAuth } from "@/lib/auth";

type Plan = "basico" | "medio" | "pro";

const plans: Array<{ id: Plan; name: string; items: string[] }> = [
  { id: "basico", name: "Básico", items: ["PDV e operação básica", "Sem delivery", "Sem nota fiscal"] },
  { id: "medio", name: "Médio", items: ["PDV", "Delivery e rotas", "Sem nota fiscal"] },
  { id: "pro", name: "Pro", items: ["Completo", "Delivery e rotas", "Nota fiscal futuramente via Focus"] },
];

export default function PlansPage() {
  const { currentStore, entitlement, isAuthenticated, isLoading, platformRole, refresh } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<Plan | null>(null);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Carregando sessão...</div>;
  if (!isAuthenticated) return <Redirect to="/login?next=%2Fplans" />;
  if (platformRole) return <Redirect to="/admin-max" />;
  if (currentStore) return <Redirect to="/" />;
  if (entitlement?.status === "active" || entitlement?.status === "trialing") return <Redirect to="/create-store" />;

  async function request(plan: Plan) {
    setRequesting(plan);
    setMessage(null);
    try {
      await authFetchJson("/api/billing/request-access", { method: "POST", body: JSON.stringify({ plan }) });
      await refresh();
      setMessage("Solicitação enviada. Aguarde liberação pelo Admin Max.");
    } finally {
      setRequesting(null);
    }
  }

  return <main className="min-h-screen bg-background p-6"><div className="mx-auto max-w-5xl space-y-6"><div className="text-center"><h1 className="text-3xl font-bold">Escolha seu plano</h1><p className="mt-2 text-muted-foreground">Libere sua loja para começar a usar o Gestor Max.</p></div>{message && <div className="rounded-lg border bg-card p-4 text-center text-sm text-green-700">{message}</div>}<div className="grid gap-4 md:grid-cols-3">{plans.map((plan) => <Card key={plan.id}><CardHeader><CardTitle>{plan.name}</CardTitle><CardDescription>Plano {plan.name}</CardDescription></CardHeader><CardContent className="space-y-4"><ul className="space-y-2">{plan.items.map((item) => <li key={item} className="flex gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-primary" />{item}</li>)}</ul><Button className="w-full" onClick={() => void request(plan.id)} disabled={Boolean(requesting)}>{requesting === plan.id ? "Enviando..." : "Solicitar liberação"}</Button></CardContent></Card>)}</div></div></main>;
}
