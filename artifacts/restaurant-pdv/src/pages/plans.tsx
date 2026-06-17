import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Receipt,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Preserve public API contract used by /api/billing/public-plans.
type PublicPlan = { plan: string; name: string; description: string; features: string[]; checkoutUrl: string | null; enabled: boolean };

type PlanMeta = {
  visualName: string;
  tag: string;
  priceLabel: string;
  description: string;
  features: string[];
  cta: string;
};

const fallbackPlans: PublicPlan[] = [
  { plan: "basico", name: "Gestor Max Start", description: "PDV e operação básica para começar com controle.", features: ["PDV", "Caixa", "Pedidos", "Cardápio"], checkoutUrl: null, enabled: false },
  { plan: "medio", name: "Gestor Max Delivery", description: "Operação completa com delivery, rotas e motoboys.", features: ["PDV", "Delivery", "Rotas", "Motoboys"], checkoutUrl: null, enabled: false },
  { plan: "pro", name: "Gestor Max Pro", description: "Completo, com fiscal preparado para ativação futura via Focus.", features: ["PDV", "Delivery", "Rotas", "Motoboys", "Fiscal em breve"], checkoutUrl: null, enabled: false },
];

const planMeta: Record<string, PlanMeta> = {
  basico: {
    visualName: "Gestor Max Start",
    tag: "Para começar",
    priceLabel: "Essencial",
    description: "Para restaurantes que querem organizar pedidos, caixa e cozinha sem complicação.",
    features: ["PDV e pedidos", "Caixa e controle básico", "Cozinha organizada", "Cardápio e produtos", "Sem delivery avançado", "Sem emissão fiscal"],
    cta: "Assinar Start",
  },
  medio: {
    visualName: "Gestor Max Delivery",
    tag: "Mais escolhido",
    priceLabel: "Delivery",
    description: "Para operações que precisam controlar entregas, motoboys, rotas e pedidos com mais velocidade.",
    features: ["Tudo do Start", "Delivery completo", "Rotas e motoboys", "Painel de cozinha", "Controle de pedidos ativos", "Sem emissão fiscal"],
    cta: "Assinar Delivery",
  },
  pro: {
    visualName: "Gestor Max Pro",
    tag: "Completo",
    priceLabel: "Operação máxima",
    description: "Para restaurantes que querem a operação completa, com delivery, gestão avançada e fiscal preparado.",
    features: ["Tudo do Delivery", "Gestão completa da operação", "Recursos avançados", "Fiscal preparado para Focus", "Suporte de implantação", "Melhor para crescimento"],
    cta: "Assinar Pro",
  },
};

const comparisonRows = [
  ["PDV e pedidos", "Sim", "Sim", "Sim"],
  ["Caixa", "Sim", "Sim", "Sim"],
  ["Cozinha", "Sim", "Sim", "Sim"],
  ["Cardápio", "Sim", "Sim", "Sim"],
  ["Delivery", "Não", "Sim", "Sim"],
  ["Rotas", "Não", "Sim", "Sim"],
  ["Motoboys", "Não", "Sim", "Sim"],
  ["Fiscal via Focus", "Não", "Não", "Preparado"],
  ["Indicado para", "Operação simples", "Loja com entregas", "Operação completa"],
];

const benefits = [
  { icon: Store, title: "Comece simples", text: "Use apenas o que sua loja precisa agora e evolua sem trocar de sistema." },
  { icon: Truck, title: "Feito para operação real", text: "Pedidos, cozinha, caixa, rotas e motoboys no mesmo fluxo." },
  { icon: Sparkles, title: "Preparado para crescer", text: "Planos pensados para sair do básico até uma operação completa." },
];

const faqs = [
  ["Preciso pagar antes de criar minha loja?", "Sim. O acesso operacional é liberado por pagamento aprovado na Cakto ou por aprovação manual do Admin Max."],
  ["O plano Start tem delivery?", "Não. O Start é focado na operação básica. Para delivery, escolha o plano Delivery ou Pro."],
  ["O plano Pro já emite nota fiscal?", "O Pro deixa o sistema preparado para integração fiscal via Focus. A ativação fiscal será configurada conforme a necessidade do cliente."],
  ["Posso solicitar acesso manualmente?", "Sim. Se preferir, use a opção de solicitação de acesso para nossa equipe liberar manualmente."],
];

function getPlanMeta(plan: string): PlanMeta {
  return planMeta[plan] ?? {
    visualName: "Gestor Max",
    tag: "Plano",
    priceLabel: "Sob medida",
    description: "Plano do Gestor Max para operar sua loja com mais controle.",
    features: ["PDV e pedidos", "Caixa", "Cozinha", "Cardápio"],
    cta: "Assinar plano",
  };
}

function isFeatured(plan: string) {
  return plan === "medio";
}

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
          setWarning("Não foi possível carregar os links de pagamento agora. Você ainda pode solicitar acesso manual.");
        }
      })
      .catch(() => {
        if (!active) return;
        setPlans(fallbackPlans);
        setWarning("Não foi possível carregar os links de pagamento agora. Você ainda pode solicitar acesso manual.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const mergedPlans = useMemo(() => {
    const byCode = new Map(plans.map((plan) => [plan.plan, plan]));
    return fallbackPlans.map((fallbackPlan) => byCode.get(fallbackPlan.plan) ?? fallbackPlan);
  }, [plans]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07070a] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top,rgba(220,38,38,0.38),rgba(127,29,29,0.12)_34%,transparent_68%)]" />
      <div className="pointer-events-none absolute left-1/2 top-20 h-72 w-72 -translate-x-1/2 rounded-full bg-red-500/20 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <section className="relative mx-auto max-w-7xl">
        <header className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-2xl shadow-black/20 backdrop-blur md:px-6">
          <Link href="/plans" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 font-black shadow-lg shadow-red-950/40">GM</span>
            <span className="text-lg font-semibold tracking-tight">Gestor Max</span>
          </Link>
          <Button asChild variant="ghost" className="text-slate-200 hover:bg-white/10 hover:text-white">
            <Link href="/login">Entrar</Link>
          </Button>
        </header>

        <div className="mx-auto max-w-4xl pb-12 pt-16 text-center md:pb-16 md:pt-24">
          <Badge className="border border-red-400/30 bg-red-500/10 px-4 py-1.5 text-red-100 hover:bg-red-500/10">Planos para restaurantes e delivery</Badge>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl">Escolha o plano ideal para operar sua loja com o Gestor Max</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">Comece com o essencial, evolua para delivery e ative recursos avançados conforme sua operação crescer.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 text-sm text-slate-300 sm:flex-row sm:flex-wrap">
            {["Sem instalação complicada", "Checkout seguro pela Cakto", "Liberação automática após pagamento"].map((item) => (
              <span key={item} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2"><ShieldCheck className="h-4 w-4 text-red-300" />{item}</span>
            ))}
          </div>
        </div>

        {warning && <div className="mx-auto mb-8 flex max-w-3xl items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{warning}</div>}
        {loading && <div className="mb-8 flex items-center justify-center gap-2 text-slate-300"><Loader2 className="h-4 w-4 animate-spin" />Carregando links de pagamento...</div>}

        <div className="grid gap-5 md:grid-cols-3 md:items-stretch">
          {mergedPlans.map((plan) => {
            const meta = getPlanMeta(plan.plan);
            const featured = isFeatured(plan.plan);
            const canCheckout = plan.enabled && Boolean(plan.checkoutUrl);
            return (
              <Card key={plan.plan} className={`relative overflow-hidden rounded-3xl bg-white/[0.055] text-white shadow-2xl shadow-black/20 backdrop-blur ${featured ? "border-red-500/60 md:-mt-4 md:scale-[1.02] md:shadow-red-950/30" : "border-white/10"}`}>
                {featured && <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 via-red-300 to-red-500" />}
                <CardHeader className="space-y-5 p-6">
                  <div className="flex items-center justify-between gap-3">
                    <Badge className={`${featured ? "bg-red-500 text-white hover:bg-red-500" : "border border-white/10 bg-white/10 text-slate-200 hover:bg-white/10"}`}>{meta.tag}</Badge>
                    {featured ? <Sparkles className="h-5 w-5 text-red-200" /> : <Receipt className="h-5 w-5 text-slate-400" />}
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-semibold">{meta.visualName}</CardTitle>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{meta.description}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Plano</p>
                    <p className="mt-1 text-2xl font-semibold">{meta.priceLabel}</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 p-6 pt-0">
                  <ul className="space-y-3 text-sm text-slate-200">
                    {meta.features.map((item) => <li key={item} className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><span>{item}</span></li>)}
                  </ul>
                  {canCheckout ? (
                    <Button asChild className="h-12 w-full rounded-xl bg-red-600 font-semibold hover:bg-red-700">
                      <a href={plan.checkoutUrl ?? undefined} target="_blank" rel="noreferrer">{meta.cta}<ArrowRight className="ml-2 h-4 w-4" /></a>
                    </Button>
                  ) : (
                    <Button asChild variant="secondary" className="h-12 w-full rounded-xl bg-white text-slate-950 hover:bg-slate-200">
                      <Link href="/register">Solicitar acesso<ArrowRight className="ml-2 h-4 w-4" /></Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <section className="mt-20 rounded-3xl border border-white/10 bg-white/[0.045] p-5 backdrop-blur md:p-8">
          <h2 className="text-2xl font-semibold md:text-3xl">Compare os recursos</h2>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-slate-400"><tr className="border-b border-white/10"><th className="py-4">Recursos</th><th>Start</th><th>Delivery</th><th>Pro</th></tr></thead>
              <tbody>{comparisonRows.map(([resource, start, delivery, pro]) => <tr key={resource} className="border-b border-white/10 last:border-0"><td className="py-4 font-medium text-white">{resource}</td>{[start, delivery, pro].map((value, index) => <td key={`${resource}-${index}`} className="pr-4 text-slate-300">{value === "Sim" ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : value === "Não" ? <X className="h-5 w-5 text-slate-600" /> : value}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="mt-16 grid gap-5 md:grid-cols-3">
          {benefits.map(({ icon: Icon, title, text }) => <Card key={title} className="rounded-3xl border-white/10 bg-white/[0.045] text-white"><CardContent className="p-6"><Icon className="h-7 w-7 text-red-300" /><h3 className="mt-5 text-xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-300">{text}</p></CardContent></Card>)}
        </section>

        <section className="mx-auto mt-16 max-w-4xl pb-16">
          <div className="mb-6 flex items-center gap-3"><HelpCircle className="h-6 w-6 text-red-300" /><h2 className="text-2xl font-semibold md:text-3xl">Perguntas frequentes</h2></div>
          <div className="space-y-3">{faqs.map(([question, answer]) => <div key={question} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><h3 className="font-semibold text-white">{question}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{answer}</p></div>)}</div>
        </section>
      </section>
    </main>
  );
}
