import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, FileText, Loader2, RefreshCcw, XCircle } from "lucide-react";
import { type Order } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authFetchJson, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type NfceDocument = {
  id: number;
  orderId: number;
  environment: "homologation" | string;
  status: "draft" | "submitting" | "processing" | "authorized" | "rejected" | "sync_pending" | "error" | "cancelled" | string;
  series: number | null;
  number: number | null;
  accessKey: string | null;
  protocol: string | null;
  xmlAvailable: boolean;
  danfceAvailable: boolean;
  rejectionCode: string | null;
  rejectionMessage: string | null;
  authorizedAt: string | null;
  lastCheckedAt: string | null;
};

type FiscalApiError = { code?: string | null; error?: string | null };

const FISCAL_ERROR_MESSAGES: Record<string, string> = {
  FISCAL_SETUP_NOT_READY: "A configuração fiscal ainda não está pronta para homologação.",
  ORDER_NOT_PAID: "O pedido ainda não está pago.",
  ORDER_HAS_NO_ITEMS: "O pedido não possui itens para emissão fiscal.",
  ORDER_TOTAL_MISMATCH: "Os totais do pedido, itens e pagamentos não fecham.",
  PAYMENT_METHOD_UNSUPPORTED: "A forma de pagamento ainda não possui mapeamento fiscal.",
  PRODUCT_FISCAL_RULE_MISSING: "Existe produto sem configuração fiscal completa.",
  FISCAL_GROUP_RULE_MISSING: "Existe grupo fiscal sem regra completa.",
  EXTERNAL_ITEM_FISCAL_MAPPING_REQUIRED: "Itens externos precisam de mapeamento fiscal antes da emissão.",
  DELIVERY_FEE_FISCAL_MAPPING_REQUIRED: "A taxa de entrega ainda precisa de configuração fiscal antes da emissão.",
  NFCE_ALREADY_AUTHORIZED: "Esta NFC-e já foi autorizada.",
  NFCE_PROCESSING: "A NFC-e já está em processamento.",
  NFCE_REJECTED: "A NFC-e foi rejeitada. Confira a mensagem e corrija os dados fiscais.",
  FISCAL_DOCUMENT_SYNC_PENDING: "A situação da NFC-e está pendente de sincronização.",
  FOCUS_NFCE_VALIDATION_ERROR: "A Focus rejeitou os dados da NFC-e.",
  FOCUS_NFCE_UNAVAILABLE: "A Focus NFe está indisponível no momento.",
};

function fiscalErrorMessage(error: unknown): string {
  const data = error && typeof error === "object" && "data" in error ? (error as { data?: FiscalApiError }).data : null;
  const code = data?.code;
  if (code && FISCAL_ERROR_MESSAGES[code]) return FISCAL_ERROR_MESSAGES[code];
  return "Não foi possível concluir a ação fiscal com segurança.";
}

type FiscalAccessStatus = { allowed?: boolean | null };

function hasFiscalIssueAccess(input: {
  isAuthenticated: boolean;
  currentStore: ReturnType<typeof useAuth>["currentStore"];
  accessStatus: FiscalAccessStatus | null;
}) {
  return (
    input.isAuthenticated &&
    Boolean(input.currentStore) &&
    input.currentStore?.role === "max_control" &&
    input.accessStatus?.allowed === true
  );
}

function isPaidOrder(order: Order) {
  return Boolean(order.paidAt || order.status === "closed");
}

export function FiscalNfcePanel({ order }: { order: Order }) {
  const { isAuthenticated, currentStore } = useAuth();
  const { toast } = useToast();
  const [document, setDocument] = useState<NfceDocument | null>(null);
  const [accessStatus, setAccessStatus] = useState<FiscalAccessStatus | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const validOrder = isPaidOrder(order) && !(["cancelled", "canceled"] as string[]).includes(String(order.status));
  const canCheckFiscalAccess = isAuthenticated && Boolean(currentStore) && currentStore?.role === "max_control" && validOrder;
  const allowedByAccess = hasFiscalIssueAccess({ isAuthenticated, currentStore, accessStatus });
  const shouldShow = allowedByAccess && validOrder;
  const issuableStatuses = ["draft", "error"] as const;
  const canIssue = shouldShow && !issuing && (!document || issuableStatuses.includes(document.status as "draft" | "error"));


  const loadAccessStatus = useCallback(async () => {
    if (!canCheckFiscalAccess) {
      setAccessStatus(null);
      return;
    }
    setAccessLoading(true);
    try {
      const next = await authFetchJson<FiscalAccessStatus>("/api/fiscal/access-status");
      setAccessStatus(next);
    } catch {
      setAccessStatus(null);
    } finally {
      setAccessLoading(false);
    }
  }, [canCheckFiscalAccess]);

  useEffect(() => {
    void loadAccessStatus();
  }, [loadAccessStatus]);
  const loadDocument = useCallback(async () => {
    if (!shouldShow) return;
    setLoading(true);
    try {
      const next = await authFetchJson<NfceDocument>(`/api/fiscal/nfce/orders/${order.id}`);
      setDocument(next.environment === "homologation" ? next : null);
    } catch (error) {
      const data = error && typeof error === "object" && "data" in error ? (error as { data?: FiscalApiError }).data : null;
      if (data?.code === "ORDER_NOT_FOUND") setDocument(null);
    } finally {
      setLoading(false);
    }
  }, [order.id, shouldShow]);

  useEffect(() => {
    void loadDocument();
  }, [loadDocument]);

  if (!shouldShow || accessLoading) return null;

  async function issue() {
    if (issuing || !canIssue) return;
    setIssuing(true);
    try {
      const next = await authFetchJson<NfceDocument>(`/api/fiscal/nfce/homologation/orders/${order.id}/issue`, { method: "POST" });
      setDocument(next);
    } catch (error) {
      toast({ title: "Erro na emissão de teste", description: fiscalErrorMessage(error), variant: "destructive" });
    } finally {
      setIssuing(false);
      setConfirmOpen(false);
    }
  }

  async function refresh() {
    if (refreshing || !document) return;
    setRefreshing(true);
    try {
      const next = await authFetchJson<NfceDocument>(`/api/fiscal/nfce/orders/${order.id}/refresh`, { method: "POST" });
      setDocument(next);
    } catch (error) {
      toast({ title: "Erro ao atualizar status", description: fiscalErrorMessage(error), variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  }

  const status = issuing ? "submitting" : document?.status ?? "none";

  return (
    <Section title="Fiscal NFC-e" icon={<FileText className="h-4 w-4" />}>
      <div className="space-y-3 rounded-xl border border-blue-200 bg-white p-4 text-sm" data-testid="nfce-homologation-panel">
        {loading ? <p className="font-semibold text-slate-600">Carregando situação fiscal...</p> : null}
        {(order.deliveryFee ?? 0) > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-semibold text-amber-800">
            Este pedido possui taxa de entrega. A emissão NFC-e será bloqueada até configurarmos o mapeamento fiscal da entrega.
          </p>
        )}
        {order.paymentTiming === "on_delivery" && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-semibold text-amber-800">
            Pedido marcado como pagar na entrega. A emissão fiscal depende de pagamento aprovado no backend.
          </p>
        )}
        {status === "none" && <p className="font-semibold text-slate-700">Nenhuma NFC-e emitida para este pedido.</p>}
        {status === "draft" && <p className="font-semibold text-amber-700">NFC-e reservada, mas ainda não enviada para a Focus.</p>}
        {status === "error" && <p className="font-semibold text-red-700">A emissão anterior falhou antes da autorização. Você pode tentar emitir novamente em homologação.</p>}
        {status === "submitting" && <p className="flex items-center gap-2 font-semibold text-blue-700"><Loader2 className="h-4 w-4 animate-spin" />Emitindo NFC-e de homologação...</p>}
        {status === "processing" && <p className="font-semibold text-blue-700">A Focus está processando a NFC-e.</p>}
        {status === "sync_pending" && <p className="font-semibold text-amber-700">Não foi possível confirmar a situação da NFC-e na Focus.</p>}
        {status === "authorized" && document && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 font-semibold text-green-700"><CheckCircle2 className="h-4 w-4" />NFC-e de homologação autorizada.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Série" value={document.series ?? "—"} />
              <Field label="Número" value={document.number ?? "—"} />
              <Field label="Chave de acesso" value={document.accessKey ?? "—"} />
              <Field label="Protocolo" value={document.protocol ?? "—"} />
              <Field label="Data de autorização" value={formatDateTime(document.authorizedAt)} />
              <Field label="XML disponível" value={document.xmlAvailable ? "Sim" : "Não"} />
              <Field label="DANFCe disponível" value={document.danfceAvailable ? "Sim" : "Não"} />
            </div>
          </div>
        )}
        {status === "rejected" && document && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 font-semibold text-red-700"><XCircle className="h-4 w-4" />NFC-e rejeitada.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Código da rejeição" value={document.rejectionCode ?? "—"} />
              <Field label="Mensagem da rejeição" value={document.rejectionMessage ?? "—"} />
            </div>
          </div>
        )}
        {(status === "none" || status === "draft" || status === "error") && (
          <Button type="button" onClick={() => setConfirmOpen(true)} disabled={!canIssue} className="bg-[#D91F16] text-white hover:bg-[#b91c1c]">
            Emitir NFC-e de teste
          </Button>
        )}
        {(status === "processing" || status === "sync_pending") && (
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Atualizar status
          </Button>
        )}
      </div>
      <Dialog open={confirmOpen} onOpenChange={(open) => !issuing && setConfirmOpen(open)}>
        <DialogContent className="max-w-md bg-white text-slate-950">
          <DialogHeader>
            <DialogTitle>Emitir NFC-e de teste?</DialogTitle>
            <DialogDescription>
              Esta emissão será feita em homologação. Ela não tem valor fiscal real, mas usará os dados fiscais configurados para validar a integração com a Focus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={issuing}>Cancelar</Button>
            <Button type="button" onClick={() => void issue()} disabled={issuing} className="bg-[#D91F16] text-white hover:bg-[#b91c1c]">
              {issuing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Emitir teste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Field({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className={`mt-0.5 text-sm ${strong ? "font-black text-slate-950" : "font-medium text-slate-800"}`}>
        {value || "—"}
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-950">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0F172A] text-white">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}
