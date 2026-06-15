import { useState } from "react";
import { Redirect, Link } from "wouter";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import type { EntitlementPlan } from "@/lib/feature-flags";

const plans: Array<{ id: EntitlementPlan; title: string; features: string[] }> = [
  { id: "basico", title: "Básico", features: ["PDV e operação básica", "Sem delivery", "Sem nota fiscal"] },
  { id: "medio", title: "Médio", features: ["PDV", "Delivery e rotas", "Sem nota fiscal"] },
  { id: "pro", title: "Pro", features: ["Completo", "Delivery e rotas", "Nota fiscal futuramente via Focus"] },
];

export default function PlansPage() {
  const { isAuthenticated, isLoading, platformRole, actor } = useAuth();
  const [requestedPlan, setRequestedPlan] = useState<EntitlementPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<EntitlementPlan | null>(null);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Carregando sessão...</div>;
  if (!isAuthenticated) return <Redirect to="/login?next=%2Fplans" />;
  if (platformRole) return <Redirect to="/admin-max" />;
  if (actor) return <Redirect to="/dashboard" />;

  async function requestAccess(plan: EntitlementPlan) {
    setSubmitting(plan);
    setError(null);
    try {
      const response = await fetch("/api/billing/request-access", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Não foi possível enviar a solicitação.");
      }
      setRequestedPlan(plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a solicitação.");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">Escolha seu plano</h1>
          <p className="mt-3 text-lg text-slate-300">Libere sua loja para começar a usar o Gestor Max.</p>
        </div>
        {error && <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>}
        {requestedPlan && (
          <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            Solicitação enviada. Aguarde liberação pelo Admin Max.
          </div>
        )}
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className="border-white/10 bg-white/[0.04] text-white">
              <CardHeader><CardTitle>{plan.title}</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <ul className="space-y-3 text-sm text-slate-200">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />{feature}</li>
                  ))}
                </ul>
                <Button className="w-full bg-red-600 hover:bg-red-700" onClick={() => void requestAccess(plan.id)} disabled={Boolean(submitting)}>
                  {submitting === plan.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Solicitar liberação
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-6 text-center text-sm text-slate-400"><Link href="/create-store" className="underline">Já fui liberado, criar loja</Link></div>
      </section>
    </main>
  );
}
