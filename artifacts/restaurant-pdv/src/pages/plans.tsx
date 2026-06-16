import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PublicPlan = { plan: string; name: string; description: string; features: string[]; checkoutUrl: string | null; enabled: boolean };

export default function PlansPage() {
  const [plans, setPlans] = useState<PublicPlan[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/billing/public-plans", { headers: { accept: "application/json" } }).then((r) => r.json()).then((d) => setPlans(d.plans ?? [])).finally(() => setLoading(false)); }, []);
  return <main className="min-h-screen bg-slate-950 px-5 py-10 text-white"><section className="mx-auto max-w-6xl"><div className="flex items-center justify-between gap-4"><div><h1 className="text-4xl font-bold">Planos do Gestor Max</h1><p className="mt-3 text-slate-300">Assine pela Cakto para liberar automaticamente seu acesso.</p></div><Link href="/login" className="text-sm text-slate-200 underline">Entrar</Link></div>{loading ? <div className="mt-10 flex items-center gap-2 text-slate-300"><Loader2 className="h-4 w-4 animate-spin" />Carregando planos...</div> : <div className="mt-8 grid gap-5 md:grid-cols-3">{plans.map((plan) => <Card key={plan.plan} className="border-white/10 bg-white/[0.04] text-white"><CardHeader><CardTitle>{plan.name}</CardTitle><p className="text-sm text-slate-300">{plan.description}</p></CardHeader><CardContent className="space-y-5"><ul className="space-y-3 text-sm text-slate-200">{plan.features.map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" />{item}</li>)}</ul>{plan.enabled && plan.checkoutUrl ? <Button asChild className="w-full bg-red-600 hover:bg-red-700"><a href={plan.checkoutUrl}>Assinar</a></Button> : <Button asChild variant="secondary" className="w-full"><Link href="/request-access">Solicitar acesso</Link></Button>}</CardContent></Card>)}</div>}</section></main>;
}
