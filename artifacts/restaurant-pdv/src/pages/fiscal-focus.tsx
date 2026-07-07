import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  CloudCog,
  Eye,
  EyeOff,
  FileKey2,
  Loader2,
  LockKeyhole,
  PlugZap,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Timer,
  XCircle,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

type MissingRequirement =
  | "company_not_linked"
  | "homologation_token_missing"
  | "certificate_missing"
  | "csc_missing"
  | "company_data_incomplete"
  | "numbering_missing"
  | "simplified_rules_incomplete"
  | "complete_product_rules_incomplete"
  | "credential_status_unavailable"
  | "fiscal_rules_status_unavailable"
  | "focus_status_unavailable";
type Status = {
  provider: string;
  environment: string;
  baseIntegrationConfigured: boolean;
  companyLinked: boolean;
  homologationCredentialConfigured: boolean;
  productionCredentialConfigured: boolean;
  certificateConfigured: boolean;
  certificateStatus: "submitted" | "valid" | "invalid" | "sync_pending" | null;
  certificateExpiresAt: string | null;
  cscConfigured: boolean;
  setupStatus: string;
  readyForHomologationTest: boolean;
  readyForHomologation: boolean;
  readyForProduction: boolean;
  missingRequirements: MissingRequirement[];
};
type ReadinessCheck = {
  code: string;
  label: string;
  status: "ok" | "warning" | "error" | "pending";
  message: string;
  blocking?: boolean;
};
type FiscalReadiness = {
  plan: { allowed: boolean; status: string | null };
  focus: {
    tokenConfigured: boolean;
    companyLinked: boolean;
    environment: string;
  };
  certificate: {
    configured: boolean;
    expiresAt: string | null;
    daysToExpire: number | null;
    status: string | null;
  };
  csc: { configured: boolean };
  fiscalConfig: {
    configured: boolean;
    cnpjConfigured: boolean;
    stateRegistrationConfigured: boolean;
  };
  lastDocument: {
    id: number;
    status: string;
    environment: string;
    createdAt: string | null;
    errorMessage: string | null;
  } | null;
  checks: ReadinessCheck[];
  readyForHomologation: boolean;
  readyForProduction: boolean;
  blockingIssues: string[];
  warnings: string[];
  productionReleaseEnabled?: boolean;
};

type ApiError = {
  error?: string | null;
  code?: string | null;
  requiredPlan?: string;
  plan?: string | null;
  status?: string | null;
  diagnosticStage?: string | null;
};
type AccessStatus = {
  feature: "fiscal";
  allowed: boolean;
  plan: string | null;
  status: string | null;
  code: string | null;
  error?: string | null;
  diagnosticStage?: string | null;
};

const missingText: Record<MissingRequirement, string> = {
  company_not_linked: "A empresa ainda não foi vinculada à Focus NFe.",
  homologation_token_missing:
    "O token de homologação ainda não foi configurado.",
  certificate_missing: "O certificado digital A1 ainda não foi enviado.",
  csc_missing: "O CSC da NFC-e ainda não foi configurado.",
  company_data_incomplete: "Os dados fiscais da empresa estão incompletos.",
  numbering_missing: "A série ou a próxima numeração da NFC-e está incompleta.",
  simplified_rules_incomplete:
    "As regras dos grupos fiscais estão incompletas.",
  complete_product_rules_incomplete:
    "Existem produtos sem configuração fiscal completa.",
  credential_status_unavailable:
    "Não foi possível verificar as credenciais salvas agora.",
  fiscal_rules_status_unavailable:
    "Não foi possível verificar as regras fiscais agora.",
  focus_status_unavailable: "Status da Focus indisponível no momento.",
};
const certText: Record<string, string> = {
  submitted:
    "Enviado à Focus. A validação será confirmada no primeiro teste de homologação.",
  valid: "Certificado validado.",
  invalid: "Certificado inválido. Envie novamente.",
  sync_pending:
    "Enviado à Focus, mas o Gestor Max precisa sincronizar o status.",
};
const emptyCompany = {
  providerCompanyId: "",
  homologationToken: "",
  productionToken: "",
};
const emptyCsc = { cscId: "", cscSecret: "" };

function safeError(error: unknown, fallback: string) {
  return typeof (error as ApiError)?.error === "string"
    ? (error as ApiError).error!
    : fallback;
}
const planText = (plan?: string | null) =>
  plan ? plan.toUpperCase() : "Não identificado";
const statusText = (status?: string | null) =>
  ({
    active: "Ativa",
    trialing: "Em teste",
    pending: "Pendente",
    past_due: "Pagamento pendente",
    cancelled: "Cancelada",
    blocked: "Bloqueada",
  })[status ?? ""] ?? "Não identificada";
function accessMessage(error: ApiError): string {
  if (error.code === "AUTH_CONTEXT_FAILED")
    return "Não foi possível validar sua sessão. Faça login novamente.";
  if (error.code === "AUTH_REQUIRED")
    return "Faça login novamente para acessar o Fiscal.";
  if (error.code === "CURRENT_STORE_REQUIRED")
    return "Selecione uma loja ativa.";
  if (error.code === "PERMISSION_DENIED")
    return "Seu usuário não é Max Control nesta loja.";
  if (error.code === "PLAN_UPGRADE_REQUIRED")
    return "Esta loja ainda não possui o plano PRO.";
  if (error.code === "SUBSCRIPTION_INACTIVE")
    return "O plano PRO foi encontrado, mas a assinatura não está ativa.";
  if (error.code === "FEATURE_ACCESS_QUERY_FAILED")
    return "Não foi possível consultar a assinatura da loja.";
  if (error.code === "FEATURE_ACCESS_CHECK_FAILED")
    return "Não foi possível verificar a assinatura da loja.";
  if (error.code === "FISCAL_ACCESS_ENDPOINT_UNAVAILABLE")
    return "O backend ainda não disponibilizou o diagnóstico fiscal. Verifique se o deploy da API está atualizado.";
  return error.error ?? "Não foi possível liberar a configuração fiscal.";
}
function FocusStatusErrorCard({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry: () => void;
}) {
  return (
    <Card className="border-red-500/30 bg-red-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
          <AlertTriangle className="h-5 w-5" />
          Não foi possível carregar o status da Focus
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Seu acesso fiscal foi reconhecido, mas o Gestor Max não conseguiu
          carregar os dados da integração Focus.
        </p>
        <p className="text-xs text-muted-foreground/80">
          Código: {error.code ?? "FOCUS_STATUS_CHECK_FAILED"}
        </p>
        <p className="text-xs text-muted-foreground/70">
          Etapa: {error.diagnosticStage ?? "focus_status_summary"}
        </p>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
      </CardContent>
    </Card>
  );
}

function AccessBlock({ error }: { error: ApiError }) {
  const isSubscriptionIssue =
    error.code === "PLAN_UPGRADE_REQUIRED" ||
    error.code === "SUBSCRIPTION_INACTIVE";
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
          {error.code === "SUBSCRIPTION_INACTIVE" ? (
            <AlertTriangle className="h-5 w-5" />
          ) : error.code === "PLAN_UPGRADE_REQUIRED" ? (
            <LockKeyhole className="h-5 w-5" />
          ) : (
            <ShieldAlert className="h-5 w-5" />
          )}
          {isSubscriptionIssue
            ? "Acesso fiscal bloqueado pela assinatura"
            : "Acesso fiscal bloqueado por permissão"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">{accessMessage(error)}</p>
        {error.code && (
          <p className="text-xs text-muted-foreground/80">
            Código: {error.code}
          </p>
        )}
        {error.diagnosticStage && (
          <p className="text-xs text-muted-foreground/70">
            Etapa: {error.diagnosticStage}
          </p>
        )}
        {(error.plan || error.status) && (
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border bg-background/70 p-3">
              <div className="text-xs text-muted-foreground">
                Plano detectado
              </div>
              <b>{planText(error.plan)}</b>
            </div>
            <div className="rounded-xl border bg-background/70 p-3">
              <div className="text-xs text-muted-foreground">Situação</div>
              <b>{statusText(error.status)}</b>
            </div>
          </div>
        )}
        {error.code === "PLAN_UPGRADE_REQUIRED" && (
          <Button asChild>
            <Link href="/plans">Conhecer o plano PRO</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
function StatusIcon({
  state,
}: {
  state: "done" | "pending" | "error" | "warning";
}) {
  if (state === "done")
    return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (state === "error") return <XCircle className="h-5 w-5 text-red-600" />;
  if (state === "warning")
    return <AlertTriangle className="h-5 w-5 text-amber-500" />;
  return <Timer className="h-5 w-5 text-sky-600" />;
}

function checkState(status: ReadinessCheck["status"]) {
  if (status === "ok") return "done";
  if (status === "error") return "error";
  if (status === "warning") return "warning";
  return "pending";
}

function FiscalReadinessCard({
  readiness,
  onRefresh,
}: {
  readiness: FiscalReadiness;
  onRefresh: () => void;
}) {
  const groups = [
    { title: "Plano PRO", codes: ["PLAN_PRO_ACTIVE"] },
    {
      title: "Dados da empresa",
      codes: [
        "FISCAL_CONFIG_EXISTS",
        "CNPJ_CONFIGURED",
        "STATE_REGISTRATION_CONFIGURED",
      ],
    },
    {
      title: "Focus NFe",
      codes: ["FOCUS_TOKEN_CONFIGURED", "FOCUS_COMPANY_LINKED"],
    },
    {
      title: "Certificado digital",
      codes: ["CERTIFICATE_CONFIGURED", "CERTIFICATE_NOT_EXPIRED"],
    },
    { title: "CSC/token", codes: ["CSC_CONFIGURED"] },
    {
      title: "Homologação",
      codes: ["HOMOLOGATION_TEST_DONE", "LAST_DOCUMENT_NOT_REJECTED"],
    },
    { title: "Produção", codes: ["PRODUCTION_ENV_NOT_ENABLED_YET"] },
  ];
  const checkByCode = new Map(
    readiness.checks.map((check) => [check.code, check]),
  );
  const summarized = groups.map((group) => {
    const checks = group.codes
      .map((code) => checkByCode.get(code))
      .filter(Boolean) as ReadinessCheck[];
    const state: "done" | "warning" | "error" | "pending" = checks.some(
      (check) => check.status === "error",
    )
      ? "error"
      : checks.some((check) => check.status === "warning")
        ? "warning"
        : checks.some((check) => check.status === "pending")
          ? "pending"
          : "done";
    return { ...group, checks, state };
  });
  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Fiscal PRO — Checklist de Implantação</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Valide a prontidão operacional antes de ativar cliente real no
            fiscal.
          </p>
        </div>
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Atualizar checklist
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {summarized.map((group) => (
            <div key={group.title} className="rounded-xl border p-4">
              <div className="flex gap-3">
                <StatusIcon state={group.state} />
                <div className="space-y-2">
                  <b>{group.title}</b>
                  {group.checks.map((check) => (
                    <p
                      key={check.code}
                      className="text-sm text-muted-foreground"
                    >
                      {check.message}
                      {check.blocking || check.status === "error" ? (
                        <span className="ml-1 font-semibold text-red-600">
                          Bloqueante.
                        </span>
                      ) : check.status === "warning" ? (
                        <span className="ml-1 font-semibold text-amber-600">
                          Aviso.
                        </span>
                      ) : null}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-xl border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Ambiente</div>
            <b>
              {readiness.focus.environment === "production"
                ? "Produção · PRODUÇÃO REAL"
                : "Homologação"}
            </b>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Certificado</div>
            <b>
              {readiness.certificate.daysToExpire === null
                ? readiness.certificate.configured
                  ? "Configurado"
                  : "Não configurado"
                : `Vence em ${readiness.certificate.daysToExpire} dias`}
            </b>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">
              Último documento
            </div>
            <b>
              {readiness.lastDocument
                ? `${readiness.lastDocument.status} · ${readiness.lastDocument.environment}`
                : "Sem documento fiscal"}
            </b>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <a href="#company">Ir para configuração Focus</a>
          </Button>
          {readiness.lastDocument && (
            <Button asChild variant="outline">
              <Link href="/fiscal">Ver área fiscal</Link>
            </Button>
          )}
        </div>
        {readiness.readyForProduction ? (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            PRODUÇÃO REAL liberada. Confirme sempre: “Estou ciente que esta NFC-e será emitida em ambiente de produção.”
          </div>
        ) : (
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            Produção fiscal ainda não liberada para esta loja.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function FiscalFocusPage() {
  const { toast } = useToast();
  const { currentStore, actor } = useAuth();
  const storeKey = currentStore?.id ?? actor?.storeId ?? "no-store";
  const [status, setStatus] = useState<Status | null>(null),
    [readiness, setReadiness] = useState<FiscalReadiness | null>(null),
    [loading, setLoading] = useState(true),
    [accessError, setAccessError] = useState<ApiError | null>(null),
    [statusError, setStatusError] = useState<ApiError | null>(null);
  const [company, setCompany] = useState(emptyCompany),
    [csc, setCsc] = useState(emptyCsc),
    [certPassword, setCertPassword] = useState(""),
    [file, setFile] = useState<File | null>(null);
  const [showHom, setShowHom] = useState(false),
    [showProd, setShowProd] = useState(false),
    [showCsc, setShowCsc] = useState(false),
    [showProdSection, setShowProdSection] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false),
    [savingCert, setSavingCert] = useState(false),
    [savingCsc, setSavingCsc] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null),
    [certError, setCertError] = useState<string | null>(null),
    [cscError, setCscError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const clearSensitive = useCallback(() => {
    setCompany(emptyCompany);
    setCsc(emptyCsc);
    setCertPassword("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setShowHom(false);
    setShowProd(false);
    setShowCsc(false);
  }, []);
  const loadStatus = useCallback(async () => {
    const id = ++requestRef.current;
    setLoading(true);
    setStatus(null);
    setReadiness(null);
    setAccessError(null);
    setStatusError(null);
    clearSensitive();
    try {
      const accessResponse = await fetch("/api/fiscal/access-status", {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const contentType = accessResponse.headers.get("content-type") ?? "";
      if (
        accessResponse.status === 404 ||
        !contentType.includes("application/json")
      ) {
        throw { code: "FISCAL_ACCESS_ENDPOINT_UNAVAILABLE" };
      }
      const accessData = await accessResponse.json().catch(() => {
        throw { code: "FISCAL_ACCESS_ENDPOINT_UNAVAILABLE" };
      });
      if (id !== requestRef.current) return;
      if (!accessResponse.ok) {
        throw accessData;
      }
      const access = accessData as AccessStatus;
      if (!access.allowed) {
        setAccessError({
          code: access.code,
          plan: access.plan,
          status: access.status,
          error: access.error,
          diagnosticStage: access.diagnosticStage,
        });
        return;
      }
      try {
        const r = await fetch("/api/fiscal/focus/status", {
          credentials: "include",
          headers: { accept: "application/json" },
        });
        const data = await r.json().catch(() => ({}));
        if (id !== requestRef.current) return;
        if (!r.ok) {
          setStatus(data as Status);
          const readinessResponse = await fetch("/api/fiscal/focus/readiness", {
            credentials: "include",
            headers: { accept: "application/json" },
          });
          const readinessData = await readinessResponse
            .json()
            .catch(() => ({}));
          if (id !== requestRef.current) return;
          if (readinessResponse.ok)
            setReadiness(readinessData as FiscalReadiness);
          setStatusError({
            error: safeError(
              data,
              "Não foi possível carregar o status da integração Focus NFe.",
            ),
            code: (data as ApiError)?.code ?? "FOCUS_STATUS_CHECK_FAILED",
            diagnosticStage:
              (data as ApiError)?.diagnosticStage ?? "focus_status_summary",
          });
          return;
        }
        setStatus(data as Status);
        const readinessResponse = await fetch("/api/fiscal/focus/readiness", {
          credentials: "include",
          headers: { accept: "application/json" },
        });
        const readinessData = await readinessResponse.json().catch(() => ({}));
        if (id !== requestRef.current) return;
        if (readinessResponse.ok)
          setReadiness(readinessData as FiscalReadiness);
      } catch (statusFailure) {
        if (id !== requestRef.current) return;
        setStatusError({
          error: safeError(
            statusFailure,
            "Não foi possível carregar o status da integração Focus NFe.",
          ),
          code:
            (statusFailure as ApiError)?.code ?? "FOCUS_STATUS_CHECK_FAILED",
          diagnosticStage:
            (statusFailure as ApiError)?.diagnosticStage ??
            "focus_status_summary",
        });
      }
    } catch (e) {
      if (id === requestRef.current)
        setAccessError({
          error: safeError(e, "Não foi possível verificar o acesso fiscal."),
          code: (e as ApiError)?.code ?? "FEATURE_ACCESS_CHECK_FAILED",
          plan: (e as ApiError)?.plan,
          status: (e as ApiError)?.status,
          diagnosticStage: (e as ApiError)?.diagnosticStage,
        });
    } finally {
      if (id === requestRef.current) setLoading(false);
    }
  }, [clearSensitive]);
  useEffect(() => {
    void loadStatus();
    return () => {
      requestRef.current += 1;
      clearSensitive();
    };
  }, [storeKey, loadStatus, clearSensitive]);
  async function submitJson(url: string, method: string, body: unknown) {
    const r = await fetch(url, {
      method,
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw data;
    setStatus(data as Status);
  }
  async function saveCompany() {
    if (savingCompany) return;
    if (
      status?.companyLinked &&
      !confirm("Substituir a empresa vinculada à Focus NFe?")
    )
      return;
    setSavingCompany(true);
    setCompanyError(null);
    try {
      await submitJson("/api/fiscal/focus/company/link", "POST", company);
      toast({ title: "Empresa Focus vinculada." });
      setCompany(emptyCompany);
      await loadStatus();
    } catch (e) {
      setCompanyError(safeError(e, "Não foi possível vincular a empresa."));
      setCompany((v) => ({ ...v, homologationToken: "", productionToken: "" }));
    } finally {
      setSavingCompany(false);
    }
  }
  async function saveCertificate() {
    if (savingCert) return;
    if (
      status?.certificateConfigured &&
      !confirm("Substituir o certificado digital A1 enviado?")
    )
      return;
    setSavingCert(true);
    setCertError(null);
    const fd = new FormData();
    if (file) fd.append("certificate", file);
    fd.append("certificatePassword", certPassword);
    try {
      const r = await fetch("/api/fiscal/focus/certificate", {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/json" },
        body: fd,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw data;
      setStatus(data as Status);
      toast({ title: "Certificado enviado à Focus." });
      await loadStatus();
    } catch (e) {
      setCertError(safeError(e, "Não foi possível enviar o certificado."));
    } finally {
      setSavingCert(false);
      setCertPassword("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function saveCsc() {
    if (savingCsc) return;
    if (status?.cscConfigured && !confirm("Substituir o CSC de homologação?"))
      return;
    setSavingCsc(true);
    setCscError(null);
    try {
      await submitJson("/api/fiscal/focus/csc", "PUT", csc);
      toast({ title: "CSC de homologação configurado." });
      setCsc(emptyCsc);
      await loadStatus();
    } catch (e) {
      setCscError(safeError(e, "Não foi possível configurar o CSC."));
      setCsc((v) => ({ ...v, cscSecret: "" }));
    } finally {
      setSavingCsc(false);
    }
  }
  const done = status
    ? [
        !status.missingRequirements.includes("company_data_incomplete") &&
          !status.missingRequirements.includes("numbering_missing"),
        status.companyLinked,
        status.homologationCredentialConfigured,
        status.certificateConfigured,
        status.cscConfigured,
        !status.missingRequirements.includes("simplified_rules_incomplete") &&
          !status.missingRequirements.includes(
            "complete_product_rules_incomplete",
          ),
        status.readyForHomologationTest,
      ]
    : [];
  const completed = done.filter(Boolean).length,
    percent = Math.round((completed / 7) * 100);
  const checklist = status
    ? ([
        [
          "Dados fiscais da empresa",
          done[0],
          status.missingRequirements.includes("company_data_incomplete") ||
            status.missingRequirements.includes("numbering_missing"),
          "Complete CNPJ, endereço, série e numeração.",
          "/fiscal",
          "Completar dados da empresa",
        ],
        [
          "Empresa Focus vinculada",
          done[1],
          status.missingRequirements.includes("company_not_linked"),
          "Conecte o identificador da empresa já criada na Focus.",
          "#company",
          "Abrir seção",
        ],
        [
          "Credencial de homologação",
          done[2],
          status.missingRequirements.includes("homologation_token_missing"),
          "Configure o token de homologação fornecido pela Focus.",
          "#company",
          "Abrir seção",
        ],
        [
          "Certificado A1 enviado",
          done[3],
          status.certificateStatus === "invalid" ||
            status.missingRequirements.includes("certificate_missing"),
          certText[status.certificateStatus ?? ""] ??
            "Certificado ainda não enviado.",
          "#certificate",
          "Abrir seção",
        ],
        [
          "CSC configurado",
          done[4],
          status.missingRequirements.includes("csc_missing"),
          "Configure o CSC de homologação da NFC-e.",
          "#csc",
          "Abrir seção",
        ],
        [
          "Regras fiscais preenchidas",
          done[5],
          status.missingRequirements.includes("simplified_rules_incomplete") ||
            status.missingRequirements.includes(
              "complete_product_rules_incomplete",
            ),
          "Revise grupos fiscais ou produtos conforme o modelo escolhido.",
          "/fiscal/groups",
          "Configurar grupos e produtos",
        ],
        [
          "Pronto para o primeiro teste",
          done[6],
          false,
          "Todas as etapas de homologação estão concluídas.",
          "#ready",
          "Ver status",
        ],
      ] as const)
    : [];
  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <PlugZap className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Integração Focus NFe
              </h1>
              <p className="mt-1 max-w-3xl text-muted-foreground">
                Conecte a empresa, o certificado digital e o CSC para preparar a
                emissão automática de NFC-e.
              </p>
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                Ambiente atual: <b>Homologação</b>. Nenhuma nota real será
                emitida durante a homologação.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => void loadStatus()}
            disabled={loading}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            Atualizar status
          </Button>
        </div>
        {loading && (
          <Card>
            <CardContent className="flex min-h-44 items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando status da integração...
            </CardContent>
          </Card>
        )}
        {!loading && accessError && <AccessBlock error={accessError} />}
        {!loading && !accessError && statusError && (
          <FocusStatusErrorCard
            error={statusError}
            onRetry={() => void loadStatus()}
          />
        )}
        {!loading && !accessError && status && (
          <>
            {readiness && (
              <FiscalReadinessCard
                readiness={readiness}
                onRefresh={() => void loadStatus()}
              />
            )}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CloudCog className="h-5 w-5" />
                  Status geral:{" "}
                  {status.readyForHomologationTest
                    ? "pronto para teste"
                    : "em configuração"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">
                      Token homologação
                    </div>
                    <b>
                      {status.homologationCredentialConfigured
                        ? "Token configurado"
                        : "Token não configurado"}
                    </b>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">
                      Token produção
                    </div>
                    <b>
                      {status.productionCredentialConfigured
                        ? "Token configurado"
                        : "Token não configurado"}
                    </b>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">CSC</div>
                    <b>
                      {status.cscConfigured
                        ? "CSC configurado"
                        : "CSC não configurado"}
                    </b>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">
                      Produção
                    </div>
                    <b>Bloqueada</b>
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span>{completed} de 7 etapas concluídas</span>
                    <span>{percent}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
                {status.missingRequirements.length > 0 && (
                  <div className="rounded-xl border bg-muted/40 p-4 text-sm">
                    <b>Pendências:</b>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {status.missingRequirements.map((m) => (
                        <li key={m}>{missingText[m]}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Checklist de homologação</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {checklist.map(([title, ok, bad, text, href, action]) => (
                  <div key={title} className="rounded-xl border p-4">
                    <div className="flex gap-3">
                      <StatusIcon
                        state={ok ? "done" : bad ? "error" : "pending"}
                      />
                      <div className="space-y-2">
                        <b>{title}</b>
                        <p className="text-sm text-muted-foreground">{text}</p>
                        {href.startsWith("#") ? (
                          <a
                            className="text-sm font-semibold text-primary"
                            href={href}
                          >
                            {action}
                          </a>
                        ) : (
                          <Button asChild size="sm" variant="outline">
                            <Link href={href}>{action}</Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="grid gap-6 xl:grid-cols-3">
              <Card id="company">
                <CardHeader>
                  <CardTitle>1. Conectar empresa à Focus NFe</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Empresa:{" "}
                    {status.companyLinked ? "vinculada" : "não vinculada"}. O
                    token salvo nunca é reexibido.
                  </p>
                  <Label>Identificador da empresa na Focus</Label>
                  <Input
                    value={company.providerCompanyId}
                    onChange={(e) =>
                      setCompany({
                        ...company,
                        providerCompanyId: e.target.value,
                      })
                    }
                  />
                  <Label>Token de homologação</Label>
                  <div className="flex gap-2">
                    <Input
                      type={showHom ? "text" : "password"}
                      value={company.homologationToken}
                      onChange={(e) =>
                        setCompany({
                          ...company,
                          homologationToken: e.target.value,
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowHom(!showHom)}
                    >
                      {showHom ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowProdSection(!showProdSection)}
                  >
                    Token de produção opcional — ainda não será ativado.
                  </Button>
                  {showProdSection && (
                    <div className="space-y-2">
                      <Label>Token de produção opcional</Label>
                      <div className="flex gap-2">
                        <Input
                          type={showProd ? "text" : "password"}
                          value={company.productionToken}
                          onChange={(e) =>
                            setCompany({
                              ...company,
                              productionToken: e.target.value,
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowProd(!showProd)}
                        >
                          {showProd ? <EyeOff /> : <Eye />}
                        </Button>
                      </div>
                    </div>
                  )}
                  {companyError && (
                    <p className="text-sm text-red-600">{companyError}</p>
                  )}
                  <Button
                    disabled={
                      savingCompany ||
                      !company.providerCompanyId ||
                      !company.homologationToken
                    }
                    onClick={() => void saveCompany()}
                  >
                    {savingCompany && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Salvar vínculo
                  </Button>
                </CardContent>
              </Card>
              <Card id="certificate">
                <CardHeader>
                  <CardTitle>2. Certificado digital A1</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    <FileKey2 className="mr-1 inline h-4 w-4" />
                    {certText[status.certificateStatus ?? ""] ??
                      "Certificado não enviado."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    O arquivo e a senha são enviados diretamente para a Focus e
                    não ficam disponíveis para consulta no sistema. Limite
                    máximo 5 MB.
                  </p>
                  <Input
                    ref={fileRef}
                    type="file"
                    accept=".pfx,.p12"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file && (
                    <p className="text-sm">
                      {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  )}
                  <Label>Senha do certificado</Label>
                  <Input
                    type="password"
                    value={certPassword}
                    onChange={(e) => setCertPassword(e.target.value)}
                  />
                  {certError && (
                    <p className="text-sm text-red-600">{certError}</p>
                  )}
                  <Button
                    disabled={savingCert || !file || !certPassword}
                    onClick={() => void saveCertificate()}
                  >
                    {savingCert && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Enviar certificado
                  </Button>
                </CardContent>
              </Card>
              <Card id="csc">
                <CardHeader>
                  <CardTitle>3. CSC da NFC-e</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    O CSC é o código de segurança fornecido pela Secretaria da
                    Fazenda para gerar o QR Code da NFC-e. Use o CSC de
                    homologação.
                  </p>
                  <p className="text-sm">
                    {status.cscConfigured
                      ? "CSC configurado"
                      : "CSC não configurado"}
                  </p>
                  <Label>ID do CSC</Label>
                  <Input
                    value={csc.cscId}
                    onChange={(e) => setCsc({ ...csc, cscId: e.target.value })}
                  />
                  <Label>CSC</Label>
                  <div className="flex gap-2">
                    <Input
                      type={showCsc ? "text" : "password"}
                      value={csc.cscSecret}
                      onChange={(e) =>
                        setCsc({ ...csc, cscSecret: e.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowCsc(!showCsc)}
                    >
                      {showCsc ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                  {cscError && (
                    <p className="text-sm text-red-600">{cscError}</p>
                  )}
                  <Button
                    disabled={savingCsc || !csc.cscId || !csc.cscSecret}
                    onClick={() => void saveCsc()}
                  >
                    {savingCsc && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Salvar CSC
                  </Button>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Ações de configuração fiscal</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link href="/fiscal">Completar dados da empresa</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/fiscal/groups">
                    Configurar grupos e produtos
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/fiscal/codes">Abrir biblioteca de códigos</Link>
                </Button>
                <Button asChild variant="outline">
                  <a
                    href="/guides/guia-preenchimento-fiscal-gestor-max.pdf"
                    download
                  >
                    Baixar manual fiscal
                  </a>
                </Button>
              </CardContent>
            </Card>
            <Card
              id="ready"
              className={
                status.readyForHomologationTest
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-amber-500/30 bg-amber-500/5"
              }
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {status.readyForHomologationTest ? (
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-amber-600" />
                  )}
                  {status.readyForHomologationTest
                    ? "Configuração pronta para o primeiro teste"
                    : "Produção bloqueada"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  {status.readyForHomologationTest
                    ? "Empresa, certificado, CSC e regras fiscais estão preparados. A próxima etapa será emitir uma NFC-e de homologação para confirmar que toda a integração está funcionando."
                    : "Produção bloqueada até concluir os testes e realizar a liberação assistida."}
                </p>
                {status.readyForHomologation && (
                  <p className="font-semibold text-emerald-700">
                    Homologação validada
                  </p>
                )}
                {!status.readyForProduction && (
                  <p>
                    Produção bloqueada até concluir os testes e realizar a
                    liberação assistida.
                  </p>
                )}
                <Button
                  disabled
                  title="A emissão de NFC-e de teste será implementada na próxima etapa."
                >
                  Emitir NFC-e de teste — disponível na próxima etapa
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
