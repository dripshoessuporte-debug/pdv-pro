import { useState } from "react";
import { Redirect } from "wouter";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { hasStoreCreationAccess, useAuth } from "@/lib/auth";

const plans = [
  { id: "basico", name: "Básico", items: ["PDV e operação básica", "Sem delivery", "Sem nota fiscal"] },
  { id: "medio", name: "Médio", items: ["PDV", "Delivery e rotas", "Sem nota fiscal"] },
  { id: "pro", name: "Pro", items: ["Completo", "Delivery e rotas", "Nota fiscal futuramente via Focus"] },
] as const;

export default function PlansPage() {
  const { entitlement, isAuthenticated, isLoading, platformRole, currentStore, refresh } = useAuth();
  const { toast } = useToast();
  const [requesting, setRequesting] = useState<string | null>(null);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Carregando...</div>;
  if (!isAuthenticated) return <Redirect to="/login?next=%2Fplans" />;
  if (platformRole) return <Redirect to="/admin-max" />;
  if (currentStore) return <Redirect to="/dashboard" />;
  if (hasStoreCreationAccess(entitlement)) return <Redirect to="/create-store" />;

  async function requestAccess(plan: string) {
    setRequesting(plan);
    try {
      const response = await fetch("/api/billing/request-access", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!response.ok) throw new Error("Não foi possível solicitar liberação.");
      toast({ title: "Solicitação enviada", description: "Solicitação enviada. Aguarde liberação pelo Admin Max." });
      await refresh();
    } finally {
      setRequesting(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <section className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-bold">Escolha seu plano</h1>
        <p className="mt-3 text-slate-300">Libere sua loja para começar a usar o Gestor Max.</p>
        {entitlement?.status === "pending" && entitlement.plan && (
          <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-amber-100">Aguardando liberação · plano {entitlement.plan}</div>
        )}
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className="border-white/10 bg-white/[0.04] text-white">
              <CardHeader><CardTitle>{plan.name}</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <ul className="space-y-3 text-sm text-slate-200">
                  {plan.items.map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" />{item}</li>)}
                </ul>
                <Button className="w-full bg-red-600 hover:bg-red-700" onClick={() => void requestAccess(plan.id)} disabled={Boolean(requesting)}>
                  {requesting === plan.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Solicitar liberação
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
