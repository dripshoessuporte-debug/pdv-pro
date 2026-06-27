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
  | "complete_product_rules_incomplete";
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
type ApiError = {
  error?: string;
  code?: string | null;
  requiredPlan?: string;
  plan?: string | null;
  status?: string | null;
};
type AccessStatus = {
  feature: "fiscal";
  allowed: boolean;
  plan: string | null;
  status: string | null;
  code: string | null;
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
  if (error.code === "PLAN_UPGRADE_REQUIRED")
    return "Esta loja ainda não possui o plano PRO.";
  if (error.code === "SUBSCRIPTION_INACTIVE")
    return "O plano PRO foi encontrado, mas a assinatura não está ativa.";
  if (error.code === "PERMISSION_DENIED" || !error.code)
    return "Seu usuário não possui permissão Max Control para configurar o Fiscal.";
  if (error.code === "FEATURE_ACCESS_CHECK_FAILED")
    return "Não foi possível verificar a assinatura da loja.";
  return error.error ?? "Não foi possível liberar a configuração fiscal.";
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
        {(error.plan || error.status) && (
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border bg-background/70 p-3">
              <div className="text-xs text-muted-foreground">Plano detectado</div>
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
function StatusIcon({ state }: { state: "done" | "pending" | "error" }) {
  if (state === "done")
    return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (state === "error") return <XCircle className="h-5 w-5 text-red-600" />;
  return <AlertTriangle className="h-5 w-5 text-amber-500" />;
}

export default function FiscalFocusPage() {
  const { toast } = useToast();
  const { currentStore, actor } = useAuth();
  const storeKey = currentStore?.id ?? actor?.storeId ?? "no-store";
  const [status, setStatus] = useState<Status | null>(null),
    [loading, setLoading] = useState(true),
    [accessError, setAccessError] = useState<ApiError | null>(null);
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
    setAccessError(null);
    clearSensitive();
    try {
      const accessResponse = await fetch("/api/fiscal/access-status", {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const accessData = await accessResponse.json().catch(() => ({}));
      if (id !== requestRef.current) return;
      if (!accessResponse.ok) {
        throw {
          ...accessData,
          code: accessResponse.status === 403 ? "PERMISSION_DENIED" : accessData.code,
        };
      }
      const access = accessData as AccessStatus;
      if (!access.allowed) {
        setAccessError({
          code: access.code,
          plan: access.plan,
          status: access.status,
        });
        return;
      }
      const r = await fetch("/api/fiscal/focus/status", {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const data = await r.json().catch(() => ({}));
      if (id !== requestRef.current) return;
      if (!r.ok) throw data;
      setStatus(data as Status);
    } catch (e) {
      if (id === requestRef.current)
        setAccessError({
          error: safeError(
            e,
            "Não foi possível carregar o status da integração Focus NFe.",
          ),
          code: (e as ApiError)?.code ?? "FEATURE_ACCESS_CHECK_FAILED",
          plan: (e as ApiError)?.plan,
          status: (e as ApiError)?.status,
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
        {!loading && status && (
          <>
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
