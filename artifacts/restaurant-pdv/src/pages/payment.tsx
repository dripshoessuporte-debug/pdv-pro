import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetOrder,
  getGetOrderQueryKey,
  useCreatePayment,
  useGetReceipt,
  getGetReceiptQueryKey,
  useGetCurrentCashRegister,
  getGetCurrentCashRegisterQueryKey,
  getListOrdersQueryKey,
  getListTablesQueryKey,
  getGetDashboardSummaryQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CheckCircle2, CreditCard, Banknote, Wallet, QrCode, Receipt, AlertTriangle, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PAYMENT_METHODS = [
  { value: "cash", label: "Dinheiro", icon: Banknote },
  { value: "pix", label: "PIX", icon: QrCode },
  { value: "credit_card", label: "Crédito", icon: CreditCard },
  { value: "debit_card", label: "Débito", icon: CreditCard },
  { value: "voucher", label: "Voucher", icon: Wallet },
] as const;

type PaymentMethod = typeof PAYMENT_METHODS[number]["value"];

export default function Payment() {
  const { orderId } = useParams<{ orderId: string }>();
  const orderIdNum = parseInt(orderId!);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [paid, setPaid] = useState(false);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [cashWarningDismissed, setCashWarningDismissed] = useState(false);

  const { data: order, isLoading } = useGetOrder(orderIdNum, {
    query: {
      enabled: !!orderIdNum,
      queryKey: getGetOrderQueryKey(orderIdNum),
    },
  });

  const { data: receipt } = useGetReceipt(orderIdNum, {
    query: {
      enabled: paid,
      queryKey: getGetReceiptQueryKey(orderIdNum),
    },
  });

  const { data: cashRegister, isError: noCashOpen } = useGetCurrentCashRegister({
    query: {
      queryKey: getGetCurrentCashRegisterQueryKey(),
      retry: false,
    },
  });

  const createPayment = useCreatePayment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCurrentCashRegisterQueryKey() });
        setPaid(true);
        toast({ title: "✅ Pagamento realizado com sucesso!" });
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) {
          setAlreadyPaid(true);
          queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderIdNum) });
          return;
        }
        toast({ title: "Erro ao processar pagamento. Tente novamente.", variant: "destructive" });
      },
    },
  });

  const handlePay = () => {
    // Guard against double-click or re-submission
    if (!order || createPayment.isPending || paid || alreadyPaid) return;
    createPayment.mutate({
      data: {
        orderId: orderIdNum,
        amount: order.totalAmount,
        method,
        ...(method === "cash" && amountTendered
          ? { amountTendered: parseFloat(amountTendered) }
          : {}),
      },
    });
  };

  const tendered = parseFloat(amountTendered) || 0;
  const change = method === "cash" && tendered > 0 && order
    ? Math.max(0, tendered - order.totalAmount)
    : null;
  const insufficient = method === "cash" && tendered > 0 && order && tendered < order.totalAmount;

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Pedido não encontrado</p>
          <Button asChild className="mt-4"><Link href="/orders">Voltar</Link></Button>
        </div>
      </Layout>
    );
  }

  /* ─── Tela de Sucesso ─── */
  if (paid) {
    return (
      <Layout>
        <div className="max-w-md mx-auto space-y-6">
          <div className="text-center py-8">
            <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold">Pagamento Confirmado!</h1>
            <p className="text-muted-foreground mt-1">Pedido #{orderIdNum} finalizado com sucesso</p>
            {change !== null && change > 0 && (
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                <p className="text-green-700 dark:text-green-300 font-bold text-2xl">
                  Troco: R$ {change.toFixed(2)}
                </p>
              </div>
            )}
          </div>

          {receipt && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="w-4 h-4" /> Comprovante
                </CardTitle>
              </CardHeader>
              <CardContent className="font-mono text-sm space-y-1">
                <div className="text-center border-b pb-3 mb-3">
                  <p className="font-bold text-lg">Gestor Max</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(receipt.order.createdAt).toLocaleString("pt-BR")}
                  </p>
                  {receipt.order.tableNumber && (
                    <p className="text-xs">Mesa {receipt.order.tableNumber}</p>
                  )}
                </div>
                {receipt.items.map((item) => (
                  <div key={item.id} className="flex justify-between" data-testid={`receipt-item-${item.id}`}>
                    <span className="truncate">{item.quantity}x {item.productName}</span>
                    <span className="ml-2 shrink-0">R$ {item.totalPrice.toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 space-y-1">
                  <div className="flex justify-between font-bold text-base">
                    <span>TOTAL</span>
                    <span>R$ {receipt.order.totalAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Forma de pagamento</span>
                    <span>{PAYMENT_METHODS.find((m) => m.value === receipt.payment.method)?.label}</span>
                  </div>
                  {receipt.payment.change != null && receipt.payment.change > 0 && (
                    <div className="flex justify-between text-xs text-green-600 dark:text-green-400 font-semibold">
                      <span>Troco</span>
                      <span>R$ {(receipt.payment.change as number).toFixed(2)}</span>
                    </div>
                  )}
                  {cashRegister && (
                    <div className="flex justify-between text-xs text-muted-foreground border-t pt-1">
                      <span>Operador</span>
                      <span>{cashRegister.operator}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => setLocation("/orders/new")} data-testid="button-new-order-after-pay">
              + Novo Pedido
            </Button>
            <Button variant="outline" onClick={() => setLocation("/orders")} data-testid="button-back-orders">
              Ver Pedidos
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  /* ─── Tela: Pedido já pago (409) ─── */
  if (alreadyPaid) {
    return (
      <Layout>
        <div className="max-w-md mx-auto text-center space-y-6 py-12">
          <div>
            <Ban className="w-20 h-20 text-amber-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold">Pedido já pago</h1>
            <p className="text-muted-foreground mt-2">
              O Pedido #{orderIdNum} já foi finalizado e não pode ser pago novamente.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => setLocation(`/orders/${orderIdNum}`)} variant="outline">
              Ver Pedido
            </Button>
            <Button onClick={() => setLocation("/orders")}>
              Ver Todos os Pedidos
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  /* ─── Tela de Pagamento ─── */
  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation(`/orders/${orderIdNum}`)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar ao Pedido
          </Button>
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pagamento</h1>
          <p className="text-muted-foreground mt-1">
            Pedido #{orderIdNum}
            {order.tableNumber ? ` · Mesa ${order.tableNumber}` : ""}
            {order.customerName ? ` · ${order.customerName}` : ""}
          </p>
        </div>

        {/* Aviso: sem caixa aberto */}
        {noCashOpen && !cashWarningDismissed && (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-800 dark:text-amber-300">Caixa não está aberto</p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                    Este pagamento não será registrado no controle de caixa. Recomendamos abrir o caixa antes de receber pagamentos.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => setLocation("/cash")}>
                      Abrir Caixa
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setCashWarningDismissed(true)}>
                      Continuar sem caixa
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Aviso resolvido: mostrar quem abriu */}
        {!noCashOpen && cashRegister && (
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
            <CheckCircle2 className="w-4 h-4" />
            Caixa aberto · Operador: <strong>{cashRegister.operator}</strong>
          </div>
        )}

        {/* Só mostra o formulário se não tiver aviso bloqueante */}
        {(!noCashOpen || cashWarningDismissed) && (
          <>
            {/* Resumo do Pedido */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Resumo do Pedido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {order.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.quantity}x {item.productName}</span>
                    <span>R$ {item.totalPrice.toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t pt-3 mt-2">
                  <div className="flex justify-between font-bold text-2xl">
                    <span>Total</span>
                    <span className="text-primary">R$ {order.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Forma de Pagamento */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Forma de Pagamento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => { setMethod(m.value); setAmountTendered(""); }}
                      className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1.5 transition-all text-xs font-semibold ${
                        method === m.value
                          ? "border-primary bg-primary/10 text-primary shadow-sm"
                          : "border-border hover:border-primary/40 hover:bg-muted"
                      }`}
                      data-testid={`button-method-${m.value}`}
                    >
                      <m.icon className="w-5 h-5" />
                      {m.label}
                    </button>
                  ))}
                </div>

                {method === "cash" && (
                  <div className="space-y-2">
                    <Label htmlFor="tendered">Valor Recebido (R$)</Label>
                    <Input
                      id="tendered"
                      type="number"
                      step="0.01"
                      min={order.totalAmount}
                      placeholder={order.totalAmount.toFixed(2)}
                      value={amountTendered}
                      onChange={(e) => setAmountTendered(e.target.value)}
                      data-testid="input-amount-tendered"
                      className="text-xl h-12"
                    />
                    {/* Atalhos de valor */}
                    <div className="flex gap-2 flex-wrap">
                      {[
                        Math.ceil(order.totalAmount / 10) * 10,
                        Math.ceil(order.totalAmount / 50) * 50,
                        Math.ceil(order.totalAmount / 100) * 100,
                      ]
                        .filter((v, i, arr) => arr.indexOf(v) === i && v >= order.totalAmount)
                        .slice(0, 3)
                        .map((val) => (
                          <Button
                            key={val}
                            size="sm"
                            variant="outline"
                            onClick={() => setAmountTendered(String(val))}
                            data-testid={`quick-amount-${val}`}
                          >
                            R$ {val.toFixed(0)}
                          </Button>
                        ))}
                      <Button size="sm" variant="outline" onClick={() => setAmountTendered(order.totalAmount.toFixed(2))}>
                        Exato
                      </Button>
                    </div>
                    {insufficient && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                        <p className="text-red-700 dark:text-red-400 text-sm font-medium">
                          ⚠️ Valor insuficiente · Faltam R$ {(order.totalAmount - tendered).toFixed(2)}
                        </p>
                      </div>
                    )}
                    {change !== null && change >= 0 && !insufficient && tendered > 0 && (
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <p className="text-green-700 dark:text-green-400 font-bold text-lg">
                          Troco: R$ {change.toFixed(2)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handlePay}
                  disabled={
                    createPayment.isPending ||
                    paid ||
                    alreadyPaid ||
                    order.items.length === 0 ||
                    (method === "cash" && !!amountTendered && !!insufficient)
                  }
                  data-testid="button-confirm-payment"
                >
                  {createPayment.isPending
                    ? "Processando..."
                    : `Confirmar Pagamento · R$ ${order.totalAmount.toFixed(2)}`}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
