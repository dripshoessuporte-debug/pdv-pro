import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetOrder,
  getGetOrderQueryKey,
  useCreatePayment,
  useGetReceipt,
  getGetReceiptQueryKey,
  getListOrdersQueryKey,
  getListTablesQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CheckCircle2, Printer, CreditCard, Banknote, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PAYMENT_METHODS = [
  { value: "cash", label: "Dinheiro", icon: Banknote },
  { value: "credit_card", label: "Credito", icon: CreditCard },
  { value: "debit_card", label: "Debito", icon: CreditCard },
  { value: "pix", label: "PIX", icon: Wallet },
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

  const { data: order, isLoading } = useGetOrder(orderIdNum, {
    query: { enabled: !!orderIdNum, queryKey: getGetOrderQueryKey(orderIdNum) },
  });

  const { data: receipt } = useGetReceipt(orderIdNum, {
    query: { enabled: paid, queryKey: getGetReceiptQueryKey(orderIdNum) },
  });

  const createPayment = useCreatePayment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        setPaid(true);
        toast({ title: "Pagamento realizado com sucesso" });
      },
      onError: () => {
        toast({ title: "Erro ao processar pagamento", variant: "destructive" });
      },
    },
  });

  const handlePay = () => {
    if (!order) return;
    createPayment.mutate({
      data: {
        orderId: orderIdNum,
        amount: order.totalAmount,
        method,
        ...(method === "cash" && amountTendered ? { amountTendered: parseFloat(amountTendered) } : {}),
      },
    });
  };

  const change = method === "cash" && amountTendered && order
    ? Math.max(0, parseFloat(amountTendered) - order.totalAmount)
    : null;

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
          <p className="text-muted-foreground">Pedido nao encontrado</p>
          <Button asChild className="mt-4"><Link href="/orders">Voltar</Link></Button>
        </div>
      </Layout>
    );
  }

  if (paid) {
    return (
      <Layout>
        <div className="max-w-md mx-auto space-y-6">
          <div className="text-center py-8">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold">Pagamento Realizado!</h1>
            <p className="text-muted-foreground mt-1">Pedido #{orderIdNum} finalizado</p>
            {receipt?.payment && receipt.payment.change !== null && receipt.payment.change > 0 && (
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <p className="text-green-700 dark:text-green-300 font-semibold text-lg">
                  Troco: R$ {receipt.payment.change.toFixed(2)}
                </p>
              </div>
            )}
          </div>

          {receipt && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Printer className="w-4 h-4" /> Comprovante
                </CardTitle>
              </CardHeader>
              <CardContent className="font-mono text-sm space-y-2">
                <div className="text-center border-b pb-3 mb-3">
                  <p className="font-bold text-base">PDV Pro</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(receipt.order.createdAt).toLocaleString("pt-BR")}
                  </p>
                </div>
                {receipt.items.map((item) => (
                  <div key={item.id} className="flex justify-between" data-testid={`receipt-item-${item.id}`}>
                    <span>{item.quantity}x {item.productName}</span>
                    <span>R$ {item.totalPrice.toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between font-bold">
                    <span>TOTAL</span>
                    <span>R$ {receipt.order.totalAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground text-xs mt-1">
                    <span>Pagamento</span>
                    <span>{PAYMENT_METHODS.find((m) => m.value === receipt.payment.method)?.label}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => setLocation("/orders")} data-testid="button-back-orders">
              Voltar aos Pedidos
            </Button>
            <Button variant="outline" onClick={() => setLocation("/")} data-testid="button-back-dashboard">
              Dashboard
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation(`/orders/${orderIdNum}`)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pagamento</h1>
          <p className="text-muted-foreground mt-1">Pedido #{orderIdNum}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Resumo do Pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>{item.quantity}x {item.productName}</span>
                <span>R$ {item.totalPrice.toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t pt-2 mt-3">
              <div className="flex justify-between font-bold text-xl">
                <span>Total</span>
                <span className="text-primary">R$ {order.totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Forma de Pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMethod(m.value)}
                  className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1 transition-all text-sm font-medium ${
                    method === m.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  }`}
                  data-testid={`button-method-${m.value}`}
                >
                  <m.icon className="w-5 h-5" />
                  {m.label}
                </button>
              ))}
            </div>

            {method === "cash" && (
              <div>
                <Label htmlFor="tendered">Valor Recebido (R$)</Label>
                <Input
                  id="tendered"
                  type="number"
                  step="0.01"
                  placeholder={order.totalAmount.toFixed(2)}
                  value={amountTendered}
                  onChange={(e) => setAmountTendered(e.target.value)}
                  data-testid="input-amount-tendered"
                />
                {change !== null && change > 0 && (
                  <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <p className="text-green-700 dark:text-green-300 font-semibold">
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
              disabled={createPayment.isPending}
              data-testid="button-confirm-payment"
            >
              {createPayment.isPending ? "Processando..." : `Confirmar Pagamento · R$ ${order.totalAmount.toFixed(2)}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
