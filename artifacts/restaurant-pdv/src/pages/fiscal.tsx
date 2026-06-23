import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers3,
  Loader2,
  LockKeyhole,
  MapPin,
  Pencil,
  Save,
  Settings2,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FiscalSettings = {
  configured: boolean;
  setupStatus: string;
  environment: string;
  emissionMode: string;
  itemizationMode: "simplified" | "complete";
  legalName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  taxRegime: string;
  crt: string;
  state: string;
  city: string;
  cityIbgeCode: string;
  postalCode: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
  series: number;
  nextNumber: number;
  natureOperation: string;
};

type FiscalAccessError = {
  error: string;
  code?: string;
  requiredPlan?: string;
  plan?: string | null;
  status?: string | null;
  fields?: Array<{ field: string; message: string }>;
};

const initialSettings: FiscalSettings = {
  configured: false,
  setupStatus: "not_configured",
  environment: "homologation",
  emissionMode: "manual",
  itemizationMode: "simplified",
  legalName: "",
  tradeName: "",
  cnpj: "",
  stateRegistration: "",
  taxRegime: "",
  crt: "",
  state: "PR",
  city: "",
  cityIbgeCode: "",
  postalCode: "",
  street: "",
  number: "",
  neighborhood: "",
  complement: "",
  series: 1,
  nextNumber: 1,
  natureOperation: "Venda de mercadoria",
};

const states = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

const steps = [
  { title: "Modelo", icon: Layers3 },
  { title: "Empresa", icon: Building2 },
  { title: "Endereço", icon: MapPin },
  { title: "Emissão", icon: Settings2 },
];

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatCnpj(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatCep(value: string): string {
  return onlyDigits(value).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}

function setupStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    not_configured: "Não configurado",
    configuring: "Em configuração",
    homologation: "Em homologação",
    production: "Em produção",
    blocked: "Bloqueado",
    disabled: "Desativado",
  };
  return labels[status] ?? status;
}

function itemizationLabel(mode: string): string {
  return mode === "complete" ? "Completo" : "Simplificado";
}

function taxRegimeLabel(regime: string): string {
  const labels: Record<string, string> = {
    simples_nacional: "Simples Nacional",
    simples_excesso: "Simples Nacional — excesso de sublimite",
    regime_normal: "Regime normal",
  };
  return labels[regime] ?? "Não informado";
}

function Field({
  id,
  label,
  required,
  children,
  hint,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label} {required && <span className="text-primary">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function FiscalPage() {
  const [settings, setSettings] = useState<FiscalSettings>(initialSettings);
  const [accessError, setAccessError] = useState<FiscalAccessError | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/fiscal/settings", {
      credentials: "include",
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as
          | { settings: FiscalSettings }
          | FiscalAccessError;
        if (!response.ok) throw data;
        return data as { settings: FiscalSettings };
      })
      .then((data) => {
        if (!cancelled) {
          setSettings({ ...initialSettings, ...data.settings });
          setAccessError(null);
        }
      })
      .catch((error: FiscalAccessError) => {
        if (!cancelled) {
          setAccessError({
            error:
              typeof error?.error === "string"
                ? error.error
                : "Não foi possível carregar a configuração fiscal.",
            code: error?.code,
            requiredPlan: error?.requiredPlan,
            plan: error?.plan,
            status: error?.status,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof FiscalSettings>(
    field: K,
    value: FiscalSettings[K],
  ) {
    setSettings((current) => ({ ...current, [field]: value }));
    setFormError(null);
  }

  function validateCurrentStep(): boolean {
    if (step === 0 && !["simplified", "complete"].includes(settings.itemizationMode)) {
      setFormError("Escolha o modelo fiscal que a loja utilizará.");
      return false;
    }
    if (step === 1) {
      if (!settings.legalName.trim()) {
        setFormError("Informe a razão social.");
        return false;
      }
      if (onlyDigits(settings.cnpj).length !== 14) {
        setFormError("Informe o CNPJ completo com 14 dígitos.");
        return false;
      }
      if (!settings.stateRegistration.trim()) {
        setFormError("Informe a Inscrição Estadual ou ISENTO.");
        return false;
      }
      if (!settings.taxRegime) {
        setFormError("Selecione o regime tributário.");
        return false;
      }
    }
    if (step === 2) {
      if (
        !settings.state ||
        !settings.city.trim() ||
        onlyDigits(settings.cityIbgeCode).length !== 7 ||
        onlyDigits(settings.postalCode).length !== 8 ||
        !settings.street.trim() ||
        !settings.number.trim() ||
        !settings.neighborhood.trim()
      ) {
        setFormError("Preencha todos os campos obrigatórios do endereço fiscal.");
        return false;
      }
    }
    if (step === 3) {
      if (
        settings.series < 1 ||
        settings.series > 999 ||
        settings.nextNumber < 1 ||
        !settings.natureOperation.trim()
      ) {
        setFormError("Revise a série, a numeração inicial e a natureza da operação.");
        return false;
      }
    }
    setFormError(null);
    return true;
  }

  function nextStep() {
    if (validateCurrentStep()) setStep((current) => Math.min(current + 1, 3));
  }

  async function saveSettings() {
    if (!validateCurrentStep()) return;
    setSaving(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/fiscal/settings", {
        method: "PUT",
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          itemizationMode: settings.itemizationMode,
          legalName: settings.legalName,
          tradeName: settings.tradeName,
          cnpj: onlyDigits(settings.cnpj),
          stateRegistration: settings.stateRegistration,
          taxRegime: settings.taxRegime,
          state: settings.state,
          city: settings.city,
          cityIbgeCode: onlyDigits(settings.cityIbgeCode),
          postalCode: onlyDigits(settings.postalCode),
          street: settings.street,
          number: settings.number,
          neighborhood: settings.neighborhood,
          complement: settings.complement,
          series: settings.series,
          nextNumber: settings.nextNumber,
          natureOperation: settings.natureOperation,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as
        | { message: string; settings: FiscalSettings }
        | FiscalAccessError;
      if (!response.ok) throw data;

      const result = data as { message: string; settings: FiscalSettings };
      setSettings({ ...initialSettings, ...result.settings });
      setSuccessMessage(result.message);
      setShowWizard(false);
      setStep(0);
    } catch (error) {
      const apiError = error as FiscalAccessError;
      setFormError(
        apiError.fields?.[0]?.message ||
          apiError.error ||
          "Não foi possível salvar a configuração fiscal.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Fiscal</h1>
            <p className="mt-1 text-muted-foreground">
              NFC-e integrada ao Gestor Max PRO.
            </p>
          </div>
        </div>

        {loading && (
          <Card>
            <CardContent className="flex min-h-44 items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando a configuração fiscal...
            </CardContent>
          </Card>
        )}

        {!loading && accessError && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                {accessError.code === "SUBSCRIPTION_INACTIVE" ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <LockKeyhole className="h-5 w-5" />
                )}
                {accessError.code === "SUBSCRIPTION_INACTIVE"
                  ? "Plano PRO sem acesso ativo"
                  : "Recurso exclusivo do Gestor Max PRO"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm text-muted-foreground">{accessError.error}</p>
              <Button asChild>
                <Link href="/plans">Conhecer o plano PRO</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !accessError && !showWizard && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
                Acesso fiscal liberado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {successMessage && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
                  {successMessage}
                </div>
              )}

              {settings.configured ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    A configuração inicial foi salva. A próxima etapa será validar
                    os grupos fiscais, o certificado A1 e o CSC antes da homologação.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border bg-background/70 p-4">
                      <div className="text-xs text-muted-foreground">Situação</div>
                      <div className="mt-1 font-semibold">
                        {setupStatusLabel(settings.setupStatus)}
                      </div>
                    </div>
                    <div className="rounded-xl border bg-background/70 p-4">
                      <div className="text-xs text-muted-foreground">Modelo</div>
                      <div className="mt-1 font-semibold">
                        {itemizationLabel(settings.itemizationMode)}
                      </div>
                    </div>
                    <div className="rounded-xl border bg-background/70 p-4">
                      <div className="text-xs text-muted-foreground">Ambiente</div>
                      <div className="mt-1 font-semibold">Homologação</div>
                    </div>
                    <div className="rounded-xl border bg-background/70 p-4">
                      <div className="text-xs text-muted-foreground">Emissão</div>
                      <div className="mt-1 font-semibold">Manual</div>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-background/70 p-4 text-sm">
                    <div className="font-semibold">{settings.legalName}</div>
                    <div className="mt-1 text-muted-foreground">
                      CNPJ {formatCnpj(settings.cnpj)} · {taxRegimeLabel(settings.taxRegime)}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      setShowWizard(true);
                      setStep(0);
                      setSuccessMessage(null);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar configuração inicial
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Sua loja possui o Gestor Max PRO e pode iniciar a implantação
                    fiscal com segurança.
                  </p>
                  <div className="rounded-xl border bg-background/70 p-4">
                    <div className="font-semibold">Configuração ainda não iniciada</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      O assistente salvará somente os dados iniciais. Nenhuma nota
                      será emitida e nenhuma informação será enviada à Focus nesta etapa.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="gap-2"
                    onClick={() => {
                      setShowWizard(true);
                      setStep(0);
                    }}
                  >
                    Iniciar configuração fiscal
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {!loading && !accessError && showWizard && (
          <Card>
            <CardHeader className="space-y-5">
              <div>
                <CardTitle>Assistente de implantação fiscal</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Etapa {step + 1} de 4 · {steps[step].title}
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {steps.map((item, index) => {
                  const Icon = item.icon;
                  const active = index === step;
                  const completed = index < step;
                  return (
                    <div
                      key={item.title}
                      className={`rounded-xl border p-3 text-center text-xs transition-colors ${
                        active
                          ? "border-primary bg-primary/5 text-primary"
                          : completed
                            ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
                            : "text-muted-foreground"
                      }`}
                    >
                      <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full border bg-background">
                        {completed ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <span className="hidden sm:inline">{item.title}</span>
                    </div>
                  );
                })}
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {step === 0 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold">Como os itens aparecerão na NFC-e?</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      A escolha poderá ser revisada durante a implantação, antes da produção.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => update("itemizationMode", "simplified")}
                      className={`rounded-2xl border p-5 text-left transition-all ${
                        settings.itemizationMode === "simplified"
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:border-primary/40 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">Modelo Simplificado</div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Agrupa itens fiscalmente compatíveis em descrições como
                            “Refeição” e “Bebida”, sem perder os produtos reais do pedido.
                          </p>
                        </div>
                        {settings.itemizationMode === "simplified" && (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                        )}
                      </div>
                      <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                        Recomendado para operações menores e implantação mais simples.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => update("itemizationMode", "complete")}
                      className={`rounded-2xl border p-5 text-left transition-all ${
                        settings.itemizationMode === "complete"
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:border-primary/40 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">Modelo Completo</div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Cada produto aparece individualmente na NFC-e, com sua
                            identificação e regra fiscal específica.
                          </p>
                        </div>
                        {settings.itemizationMode === "complete" && (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                        )}
                      </div>
                      <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                        Indicado para cardápios com cadastro fiscal detalhado.
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-lg font-semibold">Dados da empresa</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Use exatamente os dados cadastrados na Receita e na SEFAZ.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field id="legalName" label="Razão social" required>
                      <Input
                        id="legalName"
                        value={settings.legalName}
                        onChange={(event) => update("legalName", event.target.value)}
                      />
                    </Field>
                    <Field id="tradeName" label="Nome fantasia">
                      <Input
                        id="tradeName"
                        value={settings.tradeName}
                        onChange={(event) => update("tradeName", event.target.value)}
                      />
                    </Field>
                    <Field id="cnpj" label="CNPJ" required>
                      <Input
                        id="cnpj"
                        inputMode="numeric"
                        value={formatCnpj(settings.cnpj)}
                        onChange={(event) => update("cnpj", onlyDigits(event.target.value).slice(0, 14))}
                        placeholder="00.000.000/0000-00"
                      />
                    </Field>
                    <Field
                      id="stateRegistration"
                      label="Inscrição Estadual"
                      required
                      hint="Quando aplicável, confirme com o contador se o cadastro deve usar ISENTO."
                    >
                      <Input
                        id="stateRegistration"
                        value={settings.stateRegistration}
                        onChange={(event) => update("stateRegistration", event.target.value.toUpperCase())}
                      />
                    </Field>
                    <Field id="taxRegime" label="Regime tributário" required>
                      <select
                        id="taxRegime"
                        value={settings.taxRegime}
                        onChange={(event) => update("taxRegime", event.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="">Selecione</option>
                        <option value="simples_nacional">Simples Nacional</option>
                        <option value="simples_excesso">Simples Nacional — excesso de sublimite</option>
                        <option value="regime_normal">Regime normal</option>
                      </select>
                    </Field>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-lg font-semibold">Endereço fiscal</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      O endereço precisa ser o mesmo vinculado à Inscrição Estadual.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Field id="postalCode" label="CEP" required>
                      <Input
                        id="postalCode"
                        inputMode="numeric"
                        value={formatCep(settings.postalCode)}
                        onChange={(event) => update("postalCode", onlyDigits(event.target.value).slice(0, 8))}
                        placeholder="00000-000"
                      />
                    </Field>
                    <Field id="state" label="UF" required>
                      <select
                        id="state"
                        value={settings.state}
                        onChange={(event) => update("state", event.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {states.map((state) => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </Field>
                    <Field id="cityIbgeCode" label="Código IBGE do município" required>
                      <Input
                        id="cityIbgeCode"
                        inputMode="numeric"
                        value={settings.cityIbgeCode}
                        onChange={(event) => update("cityIbgeCode", onlyDigits(event.target.value).slice(0, 7))}
                        placeholder="7 dígitos"
                      />
                    </Field>
                    <Field id="city" label="Município" required>
                      <Input
                        id="city"
                        value={settings.city}
                        onChange={(event) => update("city", event.target.value)}
                      />
                    </Field>
                    <Field id="street" label="Logradouro" required>
                      <Input
                        id="street"
                        value={settings.street}
                        onChange={(event) => update("street", event.target.value)}
                      />
                    </Field>
                    <Field id="number" label="Número" required>
                      <Input
                        id="number"
                        value={settings.number}
                        onChange={(event) => update("number", event.target.value)}
                      />
                    </Field>
                    <Field id="neighborhood" label="Bairro" required>
                      <Input
                        id="neighborhood"
                        value={settings.neighborhood}
                        onChange={(event) => update("neighborhood", event.target.value)}
                      />
                    </Field>
                    <Field id="complement" label="Complemento">
                      <Input
                        id="complement"
                        value={settings.complement}
                        onChange={(event) => update("complement", event.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-lg font-semibold">Parâmetros iniciais</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Estes dados ainda serão confirmados na homologação antes da primeira nota real.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field id="series" label="Série da NFC-e" required>
                      <Input
                        id="series"
                        type="number"
                        min={1}
                        max={999}
                        value={settings.series}
                        onChange={(event) => update("series", Number(event.target.value) || 0)}
                      />
                    </Field>
                    <Field id="nextNumber" label="Próxima numeração" required>
                      <Input
                        id="nextNumber"
                        type="number"
                        min={1}
                        value={settings.nextNumber}
                        onChange={(event) => update("nextNumber", Number(event.target.value) || 0)}
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Field id="natureOperation" label="Natureza da operação" required>
                        <Input
                          id="natureOperation"
                          value={settings.natureOperation}
                          onChange={(event) => update("natureOperation", event.target.value)}
                        />
                      </Field>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <div className="text-sm font-semibold">Ambiente: Homologação</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Produção só será liberada depois dos testes e validações fiscais.
                      </p>
                    </div>
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <div className="text-sm font-semibold">Emissão: Manual</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Emissão automática ficará bloqueada até a operação estar estável.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
                    Salvar esta etapa não envia dados à SEFAZ e não emite NFC-e.
                  </div>
                </div>
              )}

              {formError && (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (step === 0) setShowWizard(false);
                    else setStep((current) => current - 1);
                    setFormError(null);
                  }}
                  disabled={saving}
                  className="gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {step === 0 ? "Cancelar" : "Voltar"}
                </Button>

                {step < 3 ? (
                  <Button type="button" onClick={nextStep} className="gap-2">
                    Continuar
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => void saveSettings()}
                    disabled={saving}
                    className="gap-2"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Salvar configuração inicial
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
