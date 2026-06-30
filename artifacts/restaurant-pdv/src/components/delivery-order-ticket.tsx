import type React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type TicketPaperWidth = "80mm" | "58mm";

export interface DeliveryTicketOrderItem {
  productId: number | null;
  productName: string;
  displayName?: string | null;
  flavors?: Array<{ productName: string; fractionNumerator: number; fractionDenominator: number }>;
  quantity: number;
  unitPrice: number;
}

export interface DeliveryTicketOrder {
  id: number;
  orderId: number;
  routeId: number;
  stopOrder: number;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryNumber?: string | null;
  deliveryNeighborhood: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  deliveryComplement?: string | null;
  deliveryReference?: string | null;
  deliveryCep: string | null;
  deliveryFee: number;
  totalAmount: number;
  paymentTiming: string | null;
  needsChange: string | null;
  changeFor: number | null;
  deliveryPaymentMethod: string | null;
  deliveryPaymentNotes: string | null;
  orderCreatedAt: string | null;
  orderKitchenAcceptedAt: string | null;
  items: DeliveryTicketOrderItem[];
}

export interface DeliveryTicketRoute {
  id: number;
  name: string;
  courierName: string | null;
}

interface TicketProps {
  order: DeliveryTicketOrder;
  route: DeliveryTicketRoute;
  storeName?: string | null;
  paperWidth?: TicketPaperWidth;
  className?: string;
}

interface DeliveryOrderTicketDialogProps extends TicketProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao: "Cartão",
};

function formatMoney(value: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isPaidOnDelivery(order: DeliveryTicketOrder): boolean {
  return order.paymentTiming === "on_delivery";
}

function needsChange(order: DeliveryTicketOrder): boolean {
  return order.needsChange === "true" || order.needsChange === "yes";
}

function getPaymentMethodLabel(order: DeliveryTicketOrder): string {
  if (!order.deliveryPaymentMethod) return "—";
  return (
    PAYMENT_METHOD_LABELS[order.deliveryPaymentMethod] ??
    order.deliveryPaymentMethod
  );
}

function getChangeNeeded(order: DeliveryTicketOrder): number | null {
  if (!needsChange(order) || order.changeFor == null) return null;
  return Math.max(0, order.changeFor - order.totalAmount);
}

function getAddressLines(order: DeliveryTicketOrder): string[] {
  const street = [
    normalizeText(order.deliveryAddress),
    normalizeText(order.deliveryNumber),
  ]
    .filter(Boolean)
    .join(", ");
  const neighborhood = normalizeText(order.deliveryNeighborhood);
  const cityState = [
    normalizeText(order.deliveryCity),
    normalizeText(order.deliveryState),
  ]
    .filter(Boolean)
    .join("/");

  return [street, neighborhood, cityState].filter((line): line is string =>
    Boolean(line),
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-dashed border-slate-300 py-2 first:border-t-0 first:pt-0">
      <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
        {title}
      </p>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex gap-2 text-[12px] leading-snug">
      <span className="min-w-[72px] shrink-0 font-semibold text-slate-500">
        {label}
      </span>
      <span
        className={`min-w-0 flex-1 break-words text-slate-950 ${strong ? "font-black" : "font-medium"}`}
      >
        {value || "—"}
      </span>
    </div>
  );
}

export function DeliveryOrderTicket({
  order,
  route,
  storeName,
  paperWidth = "80mm",
  className = "",
}: TicketProps) {
  const paidOnDelivery = isPaidOnDelivery(order);
  const changeNeeded = getChangeNeeded(order);
  const itemsTotal = order.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const addressLines = getAddressLines(order);

  return (
    <div
      className={`mx-auto max-w-full rounded-xl bg-white p-4 font-mono text-slate-950 shadow-sm ring-1 ring-slate-200 ${className}`}
      style={{ width: paperWidth }}
      data-testid="delivery-order-ticket"
    >
      <div className="mb-2 text-center">
        <p className="text-base font-black uppercase leading-tight">
          {normalizeText(storeName) ?? "Gestor Max"}
        </p>
        <p className="text-[11px] font-semibold text-slate-500">
          Comanda de entrega
        </p>
      </div>

      <Section title="Pedido">
        <Row label="Pedido" value={`#${order.orderId}`} strong />
        <Row label="Rota" value={`${route.name} (#${route.id})`} />
        <Row label="Parada" value={`${order.stopOrder}ª parada`} strong />
        {route.courierName && <Row label="Motoboy" value={route.courierName} />}
        <Row label="Criado" value={formatDateTime(order.orderCreatedAt)} />
        <Row
          label="Cozinha"
          value={formatDateTime(order.orderKitchenAcceptedAt)}
        />
      </Section>

      <Section title="Cliente">
        <Row
          label="Cliente"
          value={order.customerName ?? "Cliente não informado"}
          strong
        />
        <Row label="Telefone" value={order.customerPhone ?? "—"} />
      </Section>

      <Section title="Endereço">
        {addressLines.length > 0 ? (
          <div className="space-y-0.5 text-[12px] font-bold leading-snug">
            {addressLines.map((line) => (
              <p key={line} className="break-words">
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-[12px] font-bold">Endereço não informado</p>
        )}
        <div className="mt-1 space-y-0.5">
          <Row label="Compl." value={order.deliveryComplement ?? "—"} />
          <Row label="Refer." value={order.deliveryReference ?? "—"} />
          <Row label="CEP" value={order.deliveryCep ?? "—"} />
        </div>
      </Section>

      <Section title="Itens">
        <div className="space-y-1.5">
          {order.items.length === 0 ? (
            <p className="text-[12px] text-slate-500">
              Nenhum item registrado.
            </p>
          ) : (
            order.items.map((item, index) => (
              <div
                key={`${item.productId ?? "item"}-${index}`}
                className="text-[12px] leading-snug"
              >
                <div className="flex gap-2">
                  <span className="shrink-0 font-black">{item.quantity}×</span>
                  <span className="min-w-0 flex-1 break-words font-bold">
                    {item.displayName ?? item.productName}
                  </span>
                </div>
                <div className="flex justify-between pl-5 text-[11px] text-slate-600">
                  <span>{formatMoney(item.unitPrice)} un.</span>
                  <span className="font-bold">
                    {formatMoney(item.quantity * item.unitPrice)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Section>

      <Section title="Totais">
        <Row label="Itens" value={formatMoney(itemsTotal)} />
        <Row label="Entrega" value={formatMoney(order.deliveryFee)} />
        <Row label="Total" value={formatMoney(order.totalAmount)} strong />
      </Section>

      <Section title="Pagamento">
        <Row label="Forma" value={getPaymentMethodLabel(order)} strong />
        <div
          className={`my-2 rounded border px-2 py-1 text-center text-[12px] font-black uppercase ${paidOnDelivery ? "border-amber-400 bg-amber-50 text-amber-900" : "border-emerald-400 bg-emerald-50 text-emerald-900"}`}
        >
          {paidOnDelivery
            ? "COBRAR NA ENTREGA"
            : "PAGO AGORA — NÃO COBRAR DO CLIENTE"}
        </div>
        {paidOnDelivery && (
          <Row label="Receber" value={formatMoney(order.totalAmount)} strong />
        )}
        {needsChange(order) && order.changeFor != null && (
          <>
            <Row label="Troco p/" value={formatMoney(order.changeFor)} strong />
            <Row label="Troco" value={formatMoney(changeNeeded)} strong />
          </>
        )}
        <Row label="Obs." value={order.deliveryPaymentNotes ?? "—"} />
      </Section>
    </div>
  );
}

function renderTicketHtml({ order, route, storeName }: TicketProps): string {
  const paidOnDelivery = isPaidOnDelivery(order);
  const changeNeeded = getChangeNeeded(order);
  const itemsTotal = order.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const addressLines = getAddressLines(order);
  const row = (
    label: string,
    value: string | number | null | undefined,
    strong = false,
  ) => `
    <div class="row"><span>${escapeHtml(label)}</span><strong class="${strong ? "strong" : ""}">${escapeHtml(value ?? "—")}</strong></div>`;

  return `
    <article class="ticket">
      <header>
        <h1>${escapeHtml(normalizeText(storeName) ?? "Gestor Max")}</h1>
        <p>Comanda de entrega</p>
      </header>
      <section>
        <h2>Pedido</h2>
        ${row("Pedido", `#${order.orderId}`, true)}
        ${row("Rota", `${route.name} (#${route.id})`)}
        ${row("Parada", `${order.stopOrder}ª parada`, true)}
        ${route.courierName ? row("Motoboy", route.courierName) : ""}
        ${row("Criado", formatDateTime(order.orderCreatedAt))}
        ${row("Cozinha", formatDateTime(order.orderKitchenAcceptedAt))}
      </section>
      <section>
        <h2>Cliente</h2>
        ${row("Cliente", order.customerName ?? "Cliente não informado", true)}
        ${row("Telefone", order.customerPhone ?? "—")}
      </section>
      <section>
        <h2>Endereço</h2>
        <div class="address">${addressLines.length > 0 ? addressLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("") : "<p>Endereço não informado</p>"}</div>
        ${row("Compl.", order.deliveryComplement ?? "—")}
        ${row("Refer.", order.deliveryReference ?? "—")}
        ${row("CEP", order.deliveryCep ?? "—")}
      </section>
      <section>
        <h2>Itens</h2>
        ${
          order.items.length === 0
            ? '<p class="muted">Nenhum item registrado.</p>'
            : order.items
                .map(
                  (item) =>
                    `<div class="item"><div><b>${escapeHtml(item.quantity)}×</b> ${escapeHtml(item.displayName ?? item.productName)}</div><div class="item-total"><span>${escapeHtml(formatMoney(item.unitPrice))} un.</span><strong>${escapeHtml(formatMoney(item.quantity * item.unitPrice))}</strong></div></div>`,
                )
                .join("")
        }
      </section>
      <section>
        <h2>Totais</h2>
        ${row("Itens", formatMoney(itemsTotal))}
        ${row("Entrega", formatMoney(order.deliveryFee))}
        ${row("Total", formatMoney(order.totalAmount), true)}
      </section>
      <section>
        <h2>Pagamento</h2>
        ${row("Forma", getPaymentMethodLabel(order), true)}
        <div class="payment ${paidOnDelivery ? "collect" : "paid"}">${paidOnDelivery ? "COBRAR NA ENTREGA" : "PAGO AGORA — NÃO COBRAR DO CLIENTE"}</div>
        ${paidOnDelivery ? row("Receber", formatMoney(order.totalAmount), true) : ""}
        ${needsChange(order) && order.changeFor != null ? row("Troco p/", formatMoney(order.changeFor), true) + row("Troco", formatMoney(changeNeeded), true) : ""}
        ${row("Obs.", order.deliveryPaymentNotes ?? "—")}
      </section>
    </article>`;
}

function renderPrintDocument(
  ticketsHtml: string,
  paperWidth: TicketPaperWidth,
): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Comandas de entrega</title>
  <style>
    @page { size: ${paperWidth} auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #111827; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .ticket { width: ${paperWidth}; max-width: 100%; padding: 0 1mm 3mm; page-break-after: always; break-after: page; }
    .ticket:last-child { page-break-after: auto; break-after: auto; }
    header { text-align: center; margin-bottom: 3mm; }
    h1 { margin: 0; font-size: 14px; line-height: 1.15; text-transform: uppercase; }
    header p { margin: 1mm 0 0; font-size: 10px; font-weight: 700; color: #475569; }
    section { border-top: 1px dashed #94a3b8; padding: 2mm 0; }
    section:first-of-type { border-top: 0; padding-top: 0; }
    h2 { margin: 0 0 1mm; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #475569; }
    .row { display: flex; gap: 2mm; align-items: flex-start; font-size: 11px; line-height: 1.25; margin: .6mm 0; }
    .row span { flex: 0 0 18mm; color: #475569; font-weight: 700; }
    .row strong { flex: 1; min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
    .row strong.strong { font-weight: 900; }
    .address p { margin: 0 0 .6mm; font-size: 11px; font-weight: 800; line-height: 1.25; overflow-wrap: anywhere; }
    .item { margin: 1.2mm 0; font-size: 11px; line-height: 1.25; overflow-wrap: anywhere; }
    .item-total { display: flex; justify-content: space-between; gap: 2mm; padding-left: 5mm; font-size: 10px; color: #475569; }
    .payment { border: 1px solid #111827; padding: 1.5mm; margin: 2mm 0; text-align: center; font-size: 11px; font-weight: 900; text-transform: uppercase; }
    .paid { border-color: #059669; }
    .collect { border-color: #d97706; }
    .muted { color: #64748b; font-size: 11px; }
    @media print {
      html, body { width: ${paperWidth}; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .ticket { box-shadow: none; }
    }
  </style>
</head>
<body>${ticketsHtml}</body>
</html>`;
}

export function printDeliveryOrderTicket(
  order: DeliveryTicketOrder,
  route: DeliveryTicketRoute,
  options: { storeName?: string | null; paperWidth?: TicketPaperWidth } = {},
): boolean {
  return printDeliveryRouteTickets([order], route, options);
}

export function printDeliveryRouteTickets(
  orders: DeliveryTicketOrder[],
  route: DeliveryTicketRoute,
  options: { storeName?: string | null; paperWidth?: TicketPaperWidth } = {},
): boolean {
  const paperWidth = options.paperWidth ?? "80mm";
  const printWindow = window.open("", "_blank", "width=420,height=640");
  if (!printWindow) return false;

  const ticketsHtml = orders
    .slice()
    .sort((a, b) => a.stopOrder - b.stopOrder)
    .map((order) =>
      renderTicketHtml({
        order,
        route,
        storeName: options.storeName,
        paperWidth,
      }),
    )
    .join("");

  printWindow.document.open();
  printWindow.document.write(renderPrintDocument(ticketsHtml, paperWidth));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 250);
  return true;
}

export function DeliveryOrderTicketDialog({
  open,
  onOpenChange,
  order,
  route,
  storeName,
  paperWidth = "80mm",
}: DeliveryOrderTicketDialogProps) {
  const handlePrint = () => {
    printDeliveryOrderTicket(order, route, { storeName, paperWidth });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[420px] overflow-y-auto bg-slate-100 p-0">
        <DialogHeader className="px-4 pt-4 text-left">
          <DialogTitle>Comanda do pedido #{order.orderId}</DialogTitle>
          <DialogDescription>
            Cupom de entrega da {order.stopOrder}ª parada de {route.name}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 pb-4">
          <DeliveryOrderTicket
            order={order}
            route={route}
            storeName={storeName}
            paperWidth={paperWidth}
          />
          <Button
            className="w-full gap-2"
            onClick={handlePrint}
            data-testid="button-print-delivery-ticket"
          >
            <Printer className="h-4 w-4" />
            Imprimir comanda
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
