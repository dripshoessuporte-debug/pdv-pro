import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PublicPlan = { plan: string; name: string; description: string; features: string[]; checkoutUrl: string | null; enabled: boolean };

const fallbackPlans: PublicPlan[] = [
  { plan: "basico", name: "Gestor Max Start", description: "PDV e operação básica para começar com controle.", features: ["PDV", "Caixa", "Pedidos", "Cardápio"], checkoutUrl: null, enabled: false },
  { plan: "medio", name: "Gestor Max Delivery", description: "Operação completa com delivery, rotas e motoboys.", features: ["PDV", "Delivery", "Rotas", "Motoboys"], checkoutUrl: null, enabled: false },
  { plan: "pro", name: "Gestor Max Pro", description: "Completo, com fiscal preparado para ativação futura via Focus.", features: ["PDV", "Delivery", "Rotas", "Motoboys", "Fiscal em breve"], checkoutUrl: null, enabled: false },
];

export default function PlansPage() {
  const [plans, setPlans] = useState<PublicPlan[]>(fallbackPlans);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/billing/public-plans", { headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("public-plans retornou erro");
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        const apiPlans = Array.isArray(data?.plans) ? data.plans : [];
        if (apiPlans.length > 0) setPlans(apiPlans);
        else {
          setPlans(fallbackPlans);
          setWarning("Não foi possível carregar os links de pagamento agora.");
        }
      })
      .catch(() => {
        if (!active) return;
        setPlans(fallbackPlans);
        setWarning("Não foi possível carregar os links de pagamento agora.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  return <main className="min-h-screen bg-slate-950 px-5 py-10 text-white"><section className="mx-auto max-w-6xl"><div className="flex items-center justify-between gap-4"><div><h1 className="text-4xl font-bold">Planos do Gestor Max</h1><p className="mt-3 text-slate-300">Assine pela Cakto para liberar automaticamente seu acesso.</p></div><Link href="/login" className="text-sm text-slate-200 underline">Entrar</Link></div>{warning && <div className="mt-6 flex items-center gap-2 rounded-lg border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100"><AlertCircle className="h-4 w-4" />{warning}</div>}{loading ? <div className="mt-10 flex items-center gap-2 text-slate-300"><Loader2 className="h-4 w-4 animate-spin" />Carregando planos...</div> : <div className="mt-8 grid gap-5 md:grid-cols-3">{plans.map((plan) => <Card key={plan.plan} className="border-white/10 bg-white/[0.04] text-white"><CardHeader><CardTitle>{plan.name}</CardTitle><p className="text-sm text-slate-300">{plan.description}</p></CardHeader><CardContent className="space-y-5"><ul className="space-y-3 text-sm text-slate-200">{plan.features.map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" />{item}</li>)}</ul>{plan.enabled && plan.checkoutUrl ? <Button asChild className="w-full bg-red-600 hover:bg-red-700"><a href={plan.checkoutUrl}>Assinar</a></Button> : <Button asChild variant="secondary" className="w-full"><Link href="/register">Solicitar acesso</Link></Button>}</CardContent></Card>)}</div>}</section></main>;
}
