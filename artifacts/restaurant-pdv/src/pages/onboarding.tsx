import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { authFetchJson, useAuth } from "@/lib/auth";

type Settings = Record<string, string | number | boolean | null | undefined>;
type Status = { applies: boolean; completed: boolean; currentStep: string | null; settings?: Settings };

type StepId = "store-info" | "delivery" | "payments" | "menu" | "tables" | "team";

const steps: { id: StepId; title: string }[] = [
  { id: "store-info", title: "Dados da loja" },
  { id: "delivery", title: "Entrega" },
  { id: "payments", title: "Pagamentos" },
  { id: "menu", title: "Cardápio inicial" },
  { id: "tables", title: "Mesas / Salão" },
  { id: "team", title: "Equipe" },
];

const emptySettings: Settings = {};

function value(settings: Settings, key: string, fallback = ""): string {
  const raw = settings[key];
  return raw === null || raw === undefined ? fallback : String(raw);
}

function money(settings: Settings, key: string, fallback: string): string {
  return value(settings, key, fallback).replace(".", ",");
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return authFetchJson<T>(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export async function getOnboardingStatus(): Promise<Status> {
  return authFetchJson<Status>("/api/onboarding/status");
}

export default function OnboardingPage() {
  const { actor, isAuthenticated, isLoading, platformRole } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState<StepId>("store-info");
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || platformRole || !actor) return;
    getOnboardingStatus().then((next) => {
      setStatus(next);
      setSettings(next.settings ?? emptySettings);
      if (next.currentStep && steps.some((item) => item.id === next.currentStep)) {
        setStep(next.currentStep as StepId);
      }
    }).catch(() => setError("Não foi possível carregar o onboarding."));
  }, [actor, isAuthenticated, platformRole]);

  const currentIndex = steps.findIndex((item) => item.id === step);
  const progress = ((currentIndex + 1) / steps.length) * 100;

  const updateSetting = (key: string, nextValue: string | boolean) => {
    setSettings((current) => ({ ...current, [key]: nextValue }));
    setError(null);
  };

  async function save(path: string, body: unknown, nextStep: StepId) {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await api<Settings>(path, { method: path.includes("quick-product") || path.includes("tables") ? "POST" : "PATCH", body: JSON.stringify(body) });
      if (!path.includes("tables")) setSettings((current) => ({ ...current, ...updated }));
      setStep(nextStep);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  async function complete() {
    setIsSaving(true);
    setError(null);
    try {
      await api<Settings>("/onboarding/complete", { method: "POST", body: "{}" });
      toast({ title: "Loja configurada com sucesso." });
      navigate("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível finalizar.");
    } finally {
      setIsSaving(false);
    }
  }

  const content = useMemo(() => {
    const footer = (onSkip?: () => void) => (
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        {onSkip ? <Button type="button" variant="ghost" onClick={onSkip}>Pular por enquanto</Button> : <span />}
        <Button type="submit" disabled={isSaving}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar e continuar</Button>
      </div>
    );

    if (step === "store-info") {
      return <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void save("/onboarding/store-info", settings, "delivery"); }}>
        <Field label="Nome" value={value(settings, "storeName")} onChange={(v) => updateSetting("storeName", v)} required />
        <Field label="Telefone" value={value(settings, "storePhone")} onChange={(v) => updateSetting("storePhone", v)} required />
        <Field label="E-mail" type="email" value={value(settings, "storeEmail")} onChange={(v) => updateSetting("storeEmail", v)} required />
        <Field label="CEP" value={value(settings, "storeCep")} onChange={(v) => updateSetting("storeCep", v)} required />
        <Field label="Endereço" value={value(settings, "storeAddress")} onChange={(v) => updateSetting("storeAddress", v)} required />
        <Field label="Número" value={value(settings, "storeNumber")} onChange={(v) => updateSetting("storeNumber", v)} required />
        <Field label="Bairro" value={value(settings, "storeNeighborhood")} onChange={(v) => updateSetting("storeNeighborhood", v)} required />
        <Field label="Cidade" value={value(settings, "storeCity")} onChange={(v) => updateSetting("storeCity", v)} required />
        <Field label="Estado" value={value(settings, "storeState")} onChange={(v) => updateSetting("storeState", v)} required />
        <div className="md:col-span-2">{footer()}</div>
      </form>;
    }
    if (step === "delivery") {
      return <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void save("/onboarding/delivery", { ...settings, originCep: settings.storeCep }, "payments"); }}>
        <Toggle label="Usa delivery?" checked={Boolean(settings.usesDelivery ?? true)} onChange={(v) => updateSetting("usesDelivery", v)} />
        <Field label="CEP de origem" value={value(settings, "storeCep")} onChange={(v) => updateSetting("storeCep", v)} />
        <Field label="Taxa mínima" value={money(settings, "baseDeliveryFee", "7,00")} onChange={(v) => updateSetting("baseDeliveryFee", v)} />
        <Field label="Distância da taxa mínima (km)" value={money(settings, "baseDeliveryDistanceKm", "3,00")} onChange={(v) => updateSetting("baseDeliveryDistanceKm", v)} />
        <Field label="Valor adicional por km" value={money(settings, "additionalPricePerKm", "2,00")} onChange={(v) => updateSetting("additionalPricePerKm", v)} />
        <Field label="Tempo padrão de entrega (min)" type="number" value={value(settings, "deliveryDispatchTimeMinutes", "25")} onChange={(v) => updateSetting("deliveryDispatchTimeMinutes", v)} />
        <div className="md:col-span-2">{footer()}</div>
      </form>;
    }
    if (step === "payments") {
      return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save("/onboarding/payments", settings, "menu"); }}>
        <Toggle label="Aceita dinheiro?" checked={Boolean(settings.acceptsCash ?? true)} onChange={(v) => updateSetting("acceptsCash", v)} />
        <Toggle label="Aceita cartão?" checked={Boolean(settings.acceptsCard ?? true)} onChange={(v) => updateSetting("acceptsCard", v)} />
        <Toggle label="Aceita pix?" checked={Boolean(settings.acceptsPix ?? true)} onChange={(v) => updateSetting("acceptsPix", v)} />
        <Toggle label="Pagamento online (em breve)" checked={false} disabled onChange={() => undefined} />
        {footer()}
      </form>;
    }
    if (step === "menu") {
      return <QuickProductForm isSaving={isSaving} onSkip={() => setStep("tables")} onSubmit={(body) => save("/onboarding/quick-product", body, "tables")} />;
    }
    if (step === "tables") {
      return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save("/onboarding/tables", settings, "team"); }}>
        <Toggle label="Usa mesas/salão?" checked={Boolean(settings.usesTables)} onChange={(v) => updateSetting("usesTables", v)} />
        {settings.usesTables ? <Field label="Quantidade de mesas para criar" type="number" value={value(settings, "quantity", "10")} onChange={(v) => updateSetting("quantity", v)} /> : null}
        {footer(() => setStep("team"))}
      </form>;
    }
    return <div className="space-y-5"><p className="text-sm text-muted-foreground">Você pode convidar atendentes, cozinha e motoboys agora ou criar a equipe depois.</p><Button asChild variant="outline"><Link href="/team">Abrir equipe</Link></Button><div className="flex justify-end"><Button onClick={complete} disabled={isSaving}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Finalizar configuração</Button></div></div>;
  }, [complete, isSaving, settings, step]);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Carregando sessão...</div>;
  if (!isAuthenticated) return <Redirect to="/login?next=%2Fonboarding" />;
  if (platformRole && !actor) return <Redirect to="/admin-max" />;
  if (!actor) return <Redirect to="/create-store" />;
  if (actor.role !== "max_control") return <Redirect to="/dashboard" />;
  if (!status && !error) return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando onboarding...</div>;
  if (status?.completed) return <Redirect to="/dashboard" />;

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.15),_transparent_34%),linear-gradient(135deg,_#111827,_#030712)] px-4 py-8 text-white"><div className="mx-auto max-w-6xl"><header className="mb-8 text-center"><img src="/brand/gestor-max-logo.png" alt="Gestor Max" className="mx-auto mb-4 h-14 w-auto object-contain" /><h1 className="text-3xl font-bold">Configure sua loja</h1><p className="mt-2 text-sm text-zinc-300">Complete os passos abaixo para começar a operar.</p></header><div className="grid gap-6 lg:grid-cols-[280px_1fr]"><Card className="border-white/10 bg-white/95 text-slate-950"><CardHeader><CardTitle>Passo {currentIndex + 1} de {steps.length}</CardTitle><div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div></CardHeader><CardContent className="space-y-2">{steps.map((item, index) => <button key={item.id} type="button" className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${item.id === step ? "bg-primary text-white" : "hover:bg-slate-100"}`} onClick={() => index <= currentIndex && setStep(item.id)}><CheckCircle2 className={`h-4 w-4 ${index < currentIndex ? "text-emerald-500" : ""}`} />{item.title}</button>)}</CardContent></Card><Card className="border-white/10 bg-white/95 text-slate-950"><CardHeader><CardTitle>{steps[currentIndex]?.title}</CardTitle></CardHeader><CardContent>{error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}{content}</CardContent></Card></div></div></main>;
}

function Field({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} /></div>;
}

function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>{label}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5" /></label>;
}

function QuickProductForm({ isSaving, onSkip, onSubmit }: { isSaving: boolean; onSkip: () => void; onSubmit: (body: { name: string; price: string; category: string }) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("Geral");
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ name, price, category });
  }
  return <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}><div className="rounded-lg border bg-slate-50 p-4 md:col-span-2"><p className="font-medium">Cardápio inicial</p><p className="text-sm text-muted-foreground">Cadastre um produto rápido ou escolha cadastrar depois.</p></div><Field label="Nome do produto" value={name} onChange={setName} required /><Field label="Preço" value={price} onChange={setPrice} required /><Field label="Categoria" value={category} onChange={setCategory} required /><div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2"><Button type="button" variant="ghost" onClick={onSkip}>Vou cadastrar depois</Button><Button type="submit" disabled={isSaving}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar e continuar</Button></div></form>;
}
