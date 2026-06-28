import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Clock, CreditCard, FileText, Loader2, MapPin, Package, ReceiptText, RefreshCcw, User, XCircle } from "lucide-react";
import { useGetOrder, getGetOrderQueryKey, type Order } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatOrderTime, formatRelativeMinutes } from "@/lib/time";
import { authFetchJson, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface OrderDetailDialogProps {
  orderId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  table: "Mesa",
  counter: "Balcão",
  takeaway: "Viagem",
  delivery: "Delivery",
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  preparing: "Preparando",
  ready: "Pronto",
  closed: "Fechado",
  cancelled: "Cancelado",
};

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando preparo",
  preparing: "Em preparo",
  ready: "Pronto para entrega",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  awaiting_settlement: "Aguardando baixa financeira",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao: "Cartão",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
};

function formatMoney(value: number | null | undefined) {
  return (value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}


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

function FiscalNfcePanel({ order }: { order: Order }) {
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

function OrderContent({ order }: { order: Order }) {
  const type = order.type ?? "counter";
  const itemsTotal = order.items.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalToReceive = order.paymentTiming === "on_delivery" ? order.totalAmount : 0;
  const deliveryStatus = order.deliveryStatus ? DELIVERY_STATUS_LABELS[order.deliveryStatus] ?? order.deliveryStatus : null;
  const paymentMethod = order.deliveryPaymentMethod
    ? PAYMENT_METHOD_LABELS[order.deliveryPaymentMethod] ?? order.deliveryPaymentMethod
    : null;
  const elapsed = formatRelativeMinutes(order.createdAt);
  const timeline = [
    { label: "Pedido feito", value: order.createdAt },
    { label: "Enviado cozinha", value: order.kitchenAcceptedAt },
    { label: "Pronto", value: order.readyAt },
    { label: "Pago", value: order.paidAt },
    { label: "Fechado", value: order.closedAt },
  ].filter((item) => item.value);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Comanda completa</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Pedido #{order.id}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge className="bg-[#0F172A] text-white hover:bg-[#0F172A]">{ORDER_TYPE_LABELS[type] ?? type}</Badge>
              <Badge variant="outline" className="border-[#D91F16] text-[#D91F16]">
                {ORDER_STATUS_LABELS[order.status] ?? order.status}
              </Badge>
              {deliveryStatus && <Badge className="bg-slate-200 text-slate-950 hover:bg-slate-200">{deliveryStatus}</Badge>}
              {order.tableNumber && <Badge variant="secondary">Mesa {order.tableNumber}</Badge>}
            </div>
          </div>
          <div className="rounded-xl bg-slate-950 px-4 py-3 text-right text-white">
            <p className="text-xs text-slate-300">Total geral</p>
            <p className="text-xl font-black">{formatMoney(order.totalAmount)}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Feito às" value={formatDateTime(order.createdAt)} />
          <Field label="Tempo desde criação" value={elapsed ?? "—"} />
        </div>
      </div>

      {timeline.length > 0 && (
        <Section title="Timeline" icon={<Clock className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            {timeline.map((item) => (
              <Field key={item.label} label={item.label} value={formatOrderTime(item.value)} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Cliente" icon={<User className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="Nome" value={order.customerName ?? "Cliente avulso"} strong />
          <Field label="Telefone" value={order.customerPhone ?? "—"} />
          <Field label="Cadastro" value={order.customerId ? `Cliente #${order.customerId}` : "Nome avulso / sem cadastro"} />
        </div>
      </Section>

      {type === "delivery" && (
        <Section title="Entrega" icon={<MapPin className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="CEP" value={order.deliveryCep ?? "—"} />
            <Field label="Bairro" value={order.deliveryNeighborhood ?? "—"} />
            <Field label="Endereço completo" value={order.deliveryAddress ?? "—"} strong />
            <Field label="Complemento / referência" value={order.deliveryReference ?? "—"} />
            <Field label="Distância estimada" value={order.estimatedDistanceKm != null ? `${order.estimatedDistanceKm.toFixed(1)} km` : "—"} />
            <Field label="Taxa de entrega" value={formatMoney(order.deliveryFee)} strong />
            <Field label="Fonte taxa/distância" value={order.deliveryFeeSource ?? (order.deliveryFeeCalculated ? "Calculada" : "Manual / não informada")} />
            <Field label="Observações da entrega" value={order.deliveryNotes ?? "—"} />
          </div>
        </Section>
      )}

      <Section title="Pagamento" icon={<CreditCard className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="Total dos itens" value={formatMoney(itemsTotal)} />
          <Field label="Taxa de entrega" value={formatMoney(order.deliveryFee)} />
          <Field label="Total geral" value={formatMoney(order.totalAmount)} strong />
          <Field label="Forma de pagamento" value={paymentMethod ?? "—"} />
          <Field label="Momento" value={order.paymentTiming === "on_delivery" ? "Pagar na entrega" : "Pago agora / no caixa"} />
          <Field label="Precisa de troco?" value={order.needsChange ? "Sim" : "Não"} />
          <Field label="Troco para" value={order.changeFor != null ? formatMoney(order.changeFor) : "—"} />
          <Field label="Observação de pagamento" value={order.deliveryPaymentNotes ?? "—"} />
          <Field label="Valor a receber na entrega" value={formatMoney(totalToReceive)} strong={totalToReceive > 0} />
        </div>
      </Section>

      <FiscalNfcePanel order={order} />

      <Section title="Itens do pedido" icon={<Package className="h-4 w-4" />}>
        <div className="space-y-3">
          {order.items.length === 0 ? (
            <p className="rounded-lg bg-white p-3 text-sm text-slate-500">Nenhum item registrado.</p>
          ) : (
            order.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-black text-slate-950">
                      {item.quantity}× {item.productName ?? "Produto"}
                    </p>
                    {item.variantName && (
                      <p className="mt-0.5 text-sm font-semibold text-[#D91F16]">Variação: {item.variantName}</p>
                    )}
                    {item.notes && <p className="mt-1 text-sm font-medium text-slate-700">💬 {item.notes}</p>}
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-slate-500">Unitário {formatMoney(item.unitPrice)}</p>
                    <p className="font-black text-slate-950">Total {formatMoney(item.totalPrice)}</p>
                  </div>
                </div>

                {item.addons && item.addons.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Adicionais</p>
                    {item.addons.map((addon) => (
                      <div key={addon.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <div>
                          <p className="font-semibold text-slate-950">{addon.addonGroupName}: {addon.addonName}</p>
                          <p className="text-xs text-slate-500">Quantidade: {addon.quantity}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">{formatMoney(addon.addonPrice)} un.</p>
                          <p className="font-bold text-slate-950">{formatMoney(addon.totalPrice)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Section>

      <Section title="Observações gerais" icon={<ReceiptText className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="Pedido" value={order.notes ?? "—"} />
          <Field label="Delivery" value={order.deliveryNotes ?? "—"} />
          <Field label="Pagamento" value={order.deliveryPaymentNotes ?? "—"} />
        </div>
      </Section>
    </div>
  );
}

export function OrderDetailDialog({ orderId, open, onOpenChange }: OrderDetailDialogProps) {
  const enabled = open && orderId != null;
  const { data: order, isLoading, isError, error } = useGetOrder(orderId ?? 0, {
    query: {
      enabled,
      queryKey: orderId != null ? getGetOrderQueryKey(orderId) : ["order-detail-dialog", "empty"],
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94vh] w-[96vw] max-w-4xl grid-rows-[auto,minmax(0,1fr),auto] flex-col gap-0 overflow-hidden border-slate-200 bg-white p-0 text-slate-950 sm:rounded-2xl">
        <DialogHeader className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl font-black text-slate-950">
            <ReceiptText className="h-5 w-5 text-[#D91F16]" />
            {orderId ? `Pedido #${orderId}` : "Detalhes do pedido"}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1 text-slate-600">
            <Clock className="h-3.5 w-3.5" />
            Comanda completa para conferência de itens, entrega e pagamento.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100/70 px-4 py-4 sm:px-5">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-48 rounded-2xl" />
            </div>
          )}
          {isError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
              Não foi possível carregar a comanda. {error instanceof Error ? error.message : "Tente novamente."}
            </div>
          )}
          {!isLoading && !isError && order && <OrderContent order={order} />}
        </div>

        <DialogFooter className="border-t border-slate-200 bg-white px-5 py-4">
          <Button className="bg-[#0F172A] text-white hover:bg-[#111827]" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
