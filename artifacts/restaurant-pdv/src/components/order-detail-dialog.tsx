import { type ReactNode } from "react";
import { Clock, CreditCard, MapPin, Package, ReceiptText, User } from "lucide-react";
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
import { FiscalNfcePanel } from "@/components/fiscal-nfce-panel";

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
