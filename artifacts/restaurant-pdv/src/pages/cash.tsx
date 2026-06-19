import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useGetCurrentCashRegister,
  useOpenCashRegister,
  useCloseCashRegister,
  useAddCashMovement,
  useListCashRegisters,
  useListAwaitingSettlement,
  useSettleDeliveryOrder,
  getGetAlertsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetCurrentCashRegisterQueryKey,
  getListCashRegistersQueryKey,
  getListAwaitingSettlementQueryKey,
  type CashRegisterDetail,
  type AwaitingSettlementOrder,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Banknote,
  QrCode,
  CreditCard,
  TrendingDown,
  TrendingUp,
  History,
  LockKeyhole,
  UnlockKeyhole,
  UserCheck,
  Users,
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Plus,
  Clock,
  Truck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OrderTimeBadge } from "@/components/order-time-badge";
import { formatOrderTime } from "@/lib/time";
import { useAuth } from "@/lib/auth";

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  payment: "Pagamento",
  withdrawal: "Sangria",
  supply: "Suprimento",
  manual_in: "Entrada Manual",
};

const MOVEMENT_TYPE_ICONS: Record<string, React.ElementType> = {
  payment: CreditCard,
  withdrawal: ArrowDownCircle,
  supply: ArrowUpCircle,
  manual_in: Plus,
};

type CashOperator = {
  userId: number;
  name: string;
  email?: string | null;
  role: "max_control" | "atendente";
  memberId: number;
};

const OPERATOR_ROLE_LABELS: Record<CashOperator["role"], string> = {
  max_control: "Administrador",
  atendente: "Atendente",
};

async function fetchCashOperators(): Promise<CashOperator[]> {
  const response = await fetch("/api/cash/operators", {
    credentials: "include",
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      data?.error ?? "Não foi possível carregar operadores do caixa.",
    );
  }
  return response.json();
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  credit_card: "Crédito",
  debit_card: "Débito",
  voucher: "Voucher",
};

function fmt(v: number) {
  return `R$ ${v.toFixed(2)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Cash() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { currentStore, actor } = useAuth();
  const currentStoreId = currentStore?.id ?? actor?.storeId ?? null;
  const [tab, setTab] = useState<"current" | "history">("current");

  const {
    data: currentRegister,
    isLoading: loadingCurrent,
    isError: noCashOpen,
  } = useGetCurrentCashRegister({
    query: {
      queryKey: [
        ...getGetCurrentCashRegisterQueryKey(),
        currentStoreId ?? "no-store",
      ],
      retry: false,
      refetchInterval: 30_000,
    },
  });

  const { data: history, isLoading: loadingHistory } = useListCashRegisters({
    query: {
      queryKey: [
        ...getListCashRegistersQueryKey(),
        currentStoreId ?? "no-store",
      ],
      enabled: tab === "history" || noCashOpen,
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: [
        ...getGetCurrentCashRegisterQueryKey(),
        currentStoreId ?? "no-store",
      ],
    });
    queryClient.invalidateQueries({ queryKey: getListCashRegistersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getGetDashboardSummaryQueryKey(),
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Caixa</h1>
            <p className="text-muted-foreground mt-1">
              Controle de abertura, movimentações e fechamento
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={tab === "current" ? "default" : "outline"}
              onClick={() => setTab("current")}
            >
              <Banknote className="w-4 h-4 mr-2" /> Caixa Atual
            </Button>
            <Button
              variant={tab === "history" ? "default" : "outline"}
              onClick={() => setTab("history")}
            >
              <History className="w-4 h-4 mr-2" /> Histórico
            </Button>
          </div>
        </div>

        {tab === "current" && (
          <>
            {loadingCurrent ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-28" />
                ))}
              </div>
            ) : noCashOpen ? (
              <div className="space-y-5">
                <ClosedCashOverview
                  registers={history}
                  loading={loadingHistory}
                />
                <OpenCashForm onSuccess={invalidate} />
              </div>
            ) : currentRegister ? (
              <OpenRegisterView
                register={currentRegister}
                onSuccess={invalidate}
              />
            ) : null}
          </>
        )}

        {tab === "history" && (
          <HistoryView registers={history} loading={loadingHistory} />
        )}
      </div>
    </Layout>
  );
}

function ClosedCashOverview({
  registers,
  loading,
}: {
  registers?: CashRegisterDetail[];
  loading: boolean;
}) {
  const recent = registers?.slice(0, 5) ?? [];
  const totalSales = recent.reduce(
    (sum, register) => sum + (register.summary?.totalSales ?? 0),
    0,
  );
  const lastClosed = registers?.find(
    (register) => register.status === "closed",
  );

  return (
    <Card className="border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <History className="h-5 w-5" />
          Visão geral administrativa
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Nenhum caixa aberto agora. Exibindo histórico recente sem misturar com
          uma sessão ativa.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-white p-4 dark:bg-background">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sessões recentes
              </p>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">
                {recent.length}
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4 dark:bg-background">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Vendas recentes
              </p>
              <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-400">
                {fmt(totalSales)}
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4 dark:bg-background">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Último fechamento
              </p>
              <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                {lastClosed
                  ? fmtDate(lastClosed.closedAt ?? lastClosed.openedAt)
                  : "Sem fechamento"}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OpenCashForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const { currentStore, actor } = useAuth();
  const currentStoreId = currentStore?.id ?? actor?.storeId ?? null;
  const [operatorUserId, setOperatorUserId] = useState("");
  const [openingAmount, setOpeningAmount] = useState("");
  const [notes, setNotes] = useState("");

  const {
    data: operators = [],
    isLoading: loadingOperators,
    isError: operatorsError,
    error: operatorsErrorData,
    refetch: refetchOperators,
  } = useQuery({
    queryKey: ["cash-operators", currentStoreId ?? "no-store"],
    queryFn: fetchCashOperators,
    enabled: Boolean(currentStoreId),
    staleTime: 15_000,
    refetchOnMount: "always",
  });

  const selectedOperator = operators.find(
    (operator) => String(operator.userId) === operatorUserId,
  );
  const parsedOpeningAmount = Number(openingAmount);
  const hasValidOpeningAmount =
    openingAmount.trim() !== "" &&
    Number.isFinite(parsedOpeningAmount) &&
    parsedOpeningAmount >= 0;

  const openRegister = useOpenCashRegister({
    mutation: {
      onSuccess: () => {
        toast({ title: "✅ Caixa aberto com sucesso!" });
        onSuccess();
      },
      onError: (err) => {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data
            ?.error ?? "Erro ao abrir caixa";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const handleOpen = () => {
    if (!selectedOperator) {
      toast({
        title: "Selecione um operador do caixa",
        variant: "destructive",
      });
      return;
    }
    if (!hasValidOpeningAmount) {
      toast({
        title: "Informe um valor inicial válido",
        variant: "destructive",
      });
      return;
    }

    openRegister.mutate({
      data: {
        operatorUserId: selectedOperator.userId,
        openingAmount: parsedOpeningAmount,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
    });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-white via-background to-primary/5 shadow-2xl shadow-slate-950/10 dark:from-slate-950 dark:via-background dark:to-red-950/20">
        <div className="h-1.5 bg-gradient-to-r from-primary via-red-500 to-orange-400" />
        <CardHeader className="pb-4 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 ring-1 ring-primary/20">
            <LockKeyhole className="h-10 w-10 text-primary" />
          </div>
          <div className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-300/40 bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Caixa fechado
          </div>
          <CardTitle className="mt-3 text-2xl font-black tracking-tight">
            Abrir caixa da loja atual
          </CardTitle>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Selecione um operador ativo cadastrado na Equipe desta loja para
            iniciar uma sessão de caixa sem misturar dados entre lojas.
          </p>
        </CardHeader>
        <CardContent className="space-y-5 p-6 pt-0">
          <div className="rounded-2xl border bg-background/80 p-4 shadow-sm">
            <div className="mb-3 flex items-start gap-3 text-sm text-muted-foreground">
              <Users className="mt-0.5 h-4 w-4 text-primary" />
              <p>
                O operador precisa estar ativo na equipe da loja atual com
                perfil Administrador ou Atendente.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="operator-user-id">Operador do caixa *</Label>
              {operatorsError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertCircle className="h-4 w-4" /> Não foi possível
                    carregar operadores
                  </div>
                  <p className="mt-1 text-xs">
                    {operatorsErrorData instanceof Error
                      ? operatorsErrorData.message
                      : "Tente novamente."}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => void refetchOperators()}
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : (
                <Select
                  value={operatorUserId}
                  onValueChange={setOperatorUserId}
                  disabled={loadingOperators || operators.length === 0}
                >
                  <SelectTrigger
                    id="operator-user-id"
                    className="h-12"
                    data-testid="select-cash-operator"
                  >
                    <SelectValue
                      placeholder={
                        loadingOperators
                          ? "Carregando operadores..."
                          : "Selecione nome e cargo"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map((operator) => (
                      <SelectItem
                        key={operator.userId}
                        value={String(operator.userId)}
                      >
                        <span className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4" /> {operator.name} ·{" "}
                          {OPERATOR_ROLE_LABELS[operator.role]}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!loadingOperators &&
                !operatorsError &&
                operators.length === 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
                    Nenhum operador ativo encontrado para esta loja. Cadastre ou
                    ative um atendente/administrador em Equipe.
                  </div>
                )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="opening-amount">Valor inicial em caixa *</Label>
              <Input
                id="opening-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                data-testid="input-opening-amount"
              />
              <p className="text-xs text-muted-foreground">
                Dinheiro em espécie disponível para troco.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="open-notes">Observação opcional</Label>
              <Textarea
                id="open-notes"
                placeholder="Ex: Troco vindo do dia anterior"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <Button
            className="h-12 w-full text-base font-bold"
            size="lg"
            onClick={handleOpen}
            disabled={
              openRegister.isPending ||
              !selectedOperator ||
              !hasValidOpeningAmount
            }
            data-testid="button-open-cash"
          >
            <UnlockKeyhole className="mr-2 h-5 w-5" />
            {openRegister.isPending ? "Abrindo caixa..." : "Abrir caixa"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function OpenRegisterView({
  register,
  onSuccess,
}: {
  register: CashRegisterDetail;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [closeOpen, setCloseOpen] = useState(false);
  const [closingAmount, setClosingAmount] = useState("");
  const [closingNotes, setClosingNotes] = useState("");

  const closeRegister = useCloseCashRegister({
    mutation: {
      onSuccess: () => {
        toast({ title: "✅ Caixa fechado com sucesso!" });
        setCloseOpen(false);
        onSuccess();
      },
      onError: (err) => {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data
            ?.error ?? "Erro ao fechar caixa";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const addMovement = useAddCashMovement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetCurrentCashRegisterQueryKey(),
        });
        toast({ title: "Movimentação registrada" });
      },
      onError: () => {
        toast({
          title: "Erro ao registrar movimentação",
          variant: "destructive",
        });
      },
    },
  });

  const s = register.summary!;
  const diff = closingAmount
    ? parseFloat(closingAmount) - s.expectedCash
    : null;

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <Card className="border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/10">
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <div>
              <p className="font-bold text-green-800 dark:text-green-300">
                Caixa Aberto
              </p>
              <p className="text-xs text-green-700 dark:text-green-400">
                Caixa aberto por <strong>{register.operator}</strong>,
                compartilhado na loja · Abertura: {fmtDate(register.openedAt)}
              </p>
              {register.notes && (
                <p className="text-xs text-green-600 dark:text-green-500 italic">
                  💬 {register.notes}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <AddMovementDialog
              cashRegisterId={register.id}
              onAdd={addMovement}
            />
            <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  data-testid="button-close-cash"
                >
                  <LockKeyhole className="w-4 h-4 mr-2" /> Fechar Caixa
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Fechar Caixa</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Resumo para fechamento */}
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Dinheiro em vendas</span>
                      <span>{fmt(s.totalCash)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sangrias</span>
                      <span className="text-red-600">
                        - {fmt(s.totalWithdrawals)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Suprimentos</span>
                      <span className="text-green-600">
                        + {fmt(s.totalSupplies)}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold border-t pt-2">
                      <span>Esperado em caixa</span>
                      <span>{fmt(s.expectedCash)}</span>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="closing-amount">
                      Valor Contado em Caixa (R$) *
                    </Label>
                    <Input
                      id="closing-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={closingAmount}
                      onChange={(e) => setClosingAmount(e.target.value)}
                      data-testid="input-closing-amount"
                    />
                    {diff !== null && (
                      <div
                        className={`mt-2 p-2 rounded text-sm font-semibold ${
                          Math.abs(diff) < 0.01
                            ? "bg-green-100 text-green-700"
                            : diff > 0
                              ? "bg-blue-100 text-blue-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {Math.abs(diff) < 0.01
                          ? "✅ Caixa conferido — sem diferença"
                          : diff > 0
                            ? `↑ Sobra de ${fmt(diff)}`
                            : `↓ Falta de ${fmt(Math.abs(diff))}`}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="closing-notes">Observação (opcional)</Label>
                    <Textarea
                      id="closing-notes"
                      placeholder="Ex: Diferença justificada, trocos..."
                      value={closingNotes}
                      onChange={(e) => setClosingNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <Button
                    className="w-full"
                    variant="destructive"
                    onClick={() => {
                      if (!closingAmount) {
                        toast({
                          title: "Informe o valor contado em caixa",
                          variant: "destructive",
                        });
                        return;
                      }
                      closeRegister.mutate({
                        id: register.id,
                        data: {
                          closingAmount: parseFloat(closingAmount),
                          ...(closingNotes.trim()
                            ? { closingNotes: closingNotes.trim() }
                            : {}),
                        },
                      });
                    }}
                    disabled={closeRegister.isPending || !closingAmount}
                    data-testid="button-confirm-close"
                  >
                    {closeRegister.isPending
                      ? "Fechando..."
                      : "Confirmar Fechamento"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <SummaryCard
          label="Dinheiro"
          value={s.totalCash}
          icon={Banknote}
          color="green"
        />
        <SummaryCard
          label="PIX"
          value={s.totalPix}
          icon={QrCode}
          color="blue"
        />
        <SummaryCard
          label="Crédito"
          value={s.totalCredit}
          icon={CreditCard}
          color="purple"
        />
        <SummaryCard
          label="Débito"
          value={s.totalDebit}
          icon={CreditCard}
          color="indigo"
        />
        <SummaryCard
          label="Voucher"
          value={s.totalVoucher}
          icon={Banknote}
          color="orange"
        />
        {(s.totalPlatform ?? 0) > 0 && (
          <SummaryCard
            label="Online/Plataforma"
            value={s.totalPlatform ?? 0}
            icon={CreditCard}
            color="slate"
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-primary/30">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Vendido</p>
            <p className="text-3xl font-bold text-primary">
              {fmt(s.totalSales)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Inclui recebido no caixa e online/plataforma
            </p>
            {s.totalRestaurantReceived !== undefined && (
              <p className="text-xs text-muted-foreground">
                Recebido no caixa: {fmt(s.totalRestaurantReceived)}
              </p>
            )}
            {(s.totalPlatform ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                Online/Plataforma: {fmt(s.totalPlatform ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-red-500" /> Sangrias
            </p>
            <p className="text-2xl font-bold text-red-600">
              {fmt(s.totalWithdrawals)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-green-500" /> Suprimentos
            </p>
            <p className="text-2xl font-bold text-green-600">
              {fmt(s.totalSupplies)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Expected cash */}
      <Card className="bg-muted/30">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Fundo inicial: {fmt(register.openingAmount)}
            </p>
            <p className="font-semibold text-lg">
              Saldo esperado em dinheiro no caixa
            </p>
          </div>
          <p className="text-2xl font-bold">{fmt(s.expectedCash)}</p>
        </CardContent>
      </Card>

      {/* Pending Delivery Settlements */}
      <PendingSettlementsPanel />

      {/* Movements List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Movimentações ({register.movements?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!register.movements || register.movements.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Nenhuma movimentação registrada
            </p>
          ) : (
            <div className="space-y-2">
              {[...(register.movements ?? [])]
                .sort(
                  (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime(),
                )
                .map((m) => {
                  const Icon = MOVEMENT_TYPE_ICONS[m.type] ?? CreditCard;
                  const isOut = m.type === "withdrawal";
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-1.5 rounded-full ${isOut ? "bg-red-100 dark:bg-red-900/30" : "bg-green-100 dark:bg-green-900/30"}`}
                        >
                          <Icon
                            className={`w-4 h-4 ${isOut ? "text-red-600" : "text-green-600"}`}
                          />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {MOVEMENT_TYPE_LABELS[m.type]}
                            {m.paymentMethod
                              ? ` · ${METHOD_LABELS[m.paymentMethod] ?? m.paymentMethod}`
                              : ""}
                            {m.orderId ? ` · Pedido #${m.orderId}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {m.reason}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Movimento às{" "}
                              {formatOrderTime(m.createdAt)}
                            </span>
                            {m.orderCreatedAt && (
                              <OrderTimeBadge
                                createdAt={m.orderCreatedAt}
                                compact
                                showIcon={false}
                              />
                            )}
                            {m.orderPaidAt && (
                              <span>
                                Pago às {formatOrderTime(m.orderPaidAt)}
                              </span>
                            )}
                            {(m as { actorName?: string | null }).actorName && (
                              <span>
                                Operado por{" "}
                                {(m as { actorName?: string }).actorName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <p
                        className={`font-bold ${isOut ? "text-red-600" : "text-green-700 dark:text-green-400"}`}
                      >
                        {isOut ? "- " : "+ "}
                        {fmt(m.amount)}
                      </p>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PendingSettlementsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settleOrderId, setSettleOrderId] = useState<number | null>(null);
  const [settleMethod, setSettleMethod] = useState("cash");
  const [settleAmountReceived, setSettleAmountReceived] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const { data: pending, isLoading } = useListAwaitingSettlement({
    query: {
      queryKey: getListAwaitingSettlementQueryKey(),
      refetchInterval: 15_000,
    },
  });

  const settle = useSettleDeliveryOrder({
    mutation: {
      onSuccess: () => {
        toast({ title: "✅ Recebimento registrado com sucesso!" });
        setModalOpen(false);
        setSettleOrderId(null);
        setSettleAmountReceived("");
        queryClient.invalidateQueries({
          queryKey: getListAwaitingSettlementQueryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: getGetCurrentCashRegisterQueryKey(),
        });
        queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetDashboardSummaryQueryKey(),
        });
      },
      onError: (err) => {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data
            ?.error ?? "Erro ao registrar recebimento";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  if (isLoading || !pending || pending.length === 0) return null;

  const selectedOrder: AwaitingSettlementOrder | undefined = pending.find(
    (o) => o.id === settleOrderId,
  );
  const receivedNum = parseFloat(settleAmountReceived) || 0;
  const changePreview =
    selectedOrder &&
    settleMethod === "cash" &&
    receivedNum > selectedOrder.totalAmount
      ? receivedNum - selectedOrder.totalAmount
      : null;

  function openModal(order: AwaitingSettlementOrder) {
    setSettleOrderId(order.id);
    const autoMethod =
      order.deliveryPaymentMethod === "dinheiro"
        ? "cash"
        : order.deliveryPaymentMethod === "pix"
          ? "pix"
          : order.deliveryPaymentMethod === "cartao"
            ? "credit_card"
            : "cash";
    setSettleMethod(autoMethod);
    setSettleAmountReceived(order.changeFor ? String(order.changeFor) : "");
    setModalOpen(true);
  }

  function handleSettle() {
    if (!settleOrderId) return;
    settle.mutate({
      id: settleOrderId,
      data: {
        method: settleMethod as
          | "cash"
          | "pix"
          | "credit_card"
          | "debit_card"
          | "voucher",
        ...(settleMethod === "cash" && settleAmountReceived
          ? { amountReceived: receivedNum }
          : {}),
      },
    });
  }

  return (
    <Card className="border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-[#D91F16] dark:text-red-300 flex items-center gap-2">
          <Truck className="w-4 h-4" />
          Entregas aguardando baixa financeira ({pending.length})
        </CardTitle>
        <p className="text-xs text-[#D91F16] dark:text-red-300">
          Registre os recebimentos antes de fechar o caixa
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {pending.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-red-950/20 border border-red-200 dark:border-red-900/60"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">
                    Pedido #{order.id}
                  </span>
                  {order.customerName && (
                    <span className="text-sm text-muted-foreground">
                      · {order.customerName}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {order.deliveryNeighborhood ??
                    order.deliveryAddress ??
                    "Sem endereço"}
                  {order.courierName && ` · Motoboy: ${order.courierName}`}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="font-bold text-sm text-green-700 dark:text-green-400">
                    {fmt(order.totalAmount)}
                  </span>
                  {order.deliveryPaymentMethod && (
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {order.deliveryPaymentMethod === "dinheiro"
                        ? "Dinheiro"
                        : order.deliveryPaymentMethod === "pix"
                          ? "PIX"
                          : "Cartão"}
                    </span>
                  )}
                  {order.needsChange &&
                    order.expectedChange != null &&
                    order.expectedChange > 0 && (
                      <span className="text-xs text-amber-700 dark:text-amber-400">
                        Troco: {fmt(order.expectedChange)}
                      </span>
                    )}
                </div>
              </div>
              <Button
                size="sm"
                className="ml-3 shrink-0"
                onClick={() => openModal(order)}
                data-testid={`button-settle-${order.id}`}
              >
                Receber
              </Button>
            </div>
          ))}
        </div>

        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Registrar Recebimento</DialogTitle>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Pedido</span>
                    <span className="font-semibold">#{selectedOrder.id}</span>
                  </div>
                  {selectedOrder.customerName && (
                    <div className="flex justify-between">
                      <span>Cliente</span>
                      <span>{selectedOrder.customerName}</span>
                    </div>
                  )}
                  {selectedOrder.deliveryNeighborhood && (
                    <div className="flex justify-between">
                      <span>Bairro</span>
                      <span>{selectedOrder.deliveryNeighborhood}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t pt-2">
                    <span>Total a receber</span>
                    <span className="text-green-700 dark:text-green-400">
                      {fmt(selectedOrder.totalAmount)}
                    </span>
                  </div>
                </div>

                <div>
                  <Label>Forma de pagamento recebida</Label>
                  <Select value={settleMethod} onValueChange={setSettleMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Dinheiro</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="credit_card">Crédito</SelectItem>
                      <SelectItem value="debit_card">Débito</SelectItem>
                      <SelectItem value="voucher">Voucher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {settleMethod === "cash" && (
                  <div>
                    <Label htmlFor="settle-amount">Valor recebido (R$) *</Label>
                    <Input
                      id="settle-amount"
                      type="number"
                      step="0.01"
                      min={selectedOrder.totalAmount}
                      placeholder={selectedOrder.totalAmount.toFixed(2)}
                      value={settleAmountReceived}
                      onChange={(e) => setSettleAmountReceived(e.target.value)}
                      data-testid="input-settle-amount"
                    />
                    {changePreview !== null && changePreview > 0 && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                        Troco a devolver: {fmt(changePreview)}
                      </p>
                    )}
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={handleSettle}
                  disabled={
                    settle.isPending ||
                    (settleMethod === "cash" &&
                      (!settleAmountReceived ||
                        receivedNum < selectedOrder.totalAmount))
                  }
                  data-testid="button-confirm-settle"
                >
                  {settle.isPending
                    ? "Registrando..."
                    : "Confirmar Recebimento"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function AddMovementDialog({
  cashRegisterId,
  onAdd,
}: {
  cashRegisterId: number;
  onAdd: ReturnType<typeof useAddCashMovement>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"withdrawal" | "supply" | "manual_in">(
    "withdrawal",
  );
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({ title: "Informe um valor válido", variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({ title: "Informe o motivo", variant: "destructive" });
      return;
    }
    onAdd.mutate(
      {
        data: {
          cashRegisterId,
          type,
          amount: parseFloat(amount),
          reason: reason.trim(),
        },
      },
      {
        onSuccess: () => {
          setOpen(false);
          setAmount("");
          setReason("");
          setType("withdrawal");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-add-movement">
          <Plus className="w-4 h-4 mr-2" /> Movimentação
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar Movimentação</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tipo</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as typeof type)}
            >
              <SelectTrigger data-testid="select-movement-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="withdrawal">Sangria / Retirada</SelectItem>
                <SelectItem value="supply">Suprimento / Reforço</SelectItem>
                <SelectItem value="manual_in">Entrada Manual</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {type === "withdrawal" && "Retirada de dinheiro do caixa"}
              {type === "supply" && "Adição de dinheiro ao caixa"}
              {type === "manual_in" && "Registro manual de entrada"}
            </p>
          </div>
          <div>
            <Label htmlFor="mov-amount">Valor (R$) *</Label>
            <Input
              id="mov-amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="input-movement-amount"
            />
          </div>
          <div>
            <Label htmlFor="mov-reason">Motivo *</Label>
            <Input
              id="mov-reason"
              placeholder="Ex: Sangria para cofre, troco..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="input-movement-reason"
            />
          </div>
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={onAdd.isPending}
            data-testid="button-confirm-movement"
          >
            {onAdd.isPending ? "Registrando..." : "Confirmar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  const colors: Record<string, string> = {
    green: "text-green-600 bg-green-100 dark:bg-green-900/30",
    blue: "text-blue-600 bg-blue-100 dark:bg-blue-900/30",
    purple: "text-purple-600 bg-purple-100 dark:bg-purple-900/30",
    indigo: "text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30",
    orange: "text-[#D91F16] bg-red-100 dark:bg-red-900/30",
    slate: "text-slate-600 bg-slate-100 dark:bg-slate-900/30",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colors[color]}`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-bold text-lg">{fmt(value)}</p>
      </CardContent>
    </Card>
  );
}

function HistoryView({
  registers,
  loading,
}: {
  registers: CashRegisterDetail[] | undefined;
  loading: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!registers || registers.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <History className="w-16 h-16 mx-auto mb-3 opacity-20" />
        <p className="text-lg font-medium">Nenhum caixa registrado ainda</p>
        <p className="text-sm mt-1">Abra o primeiro caixa para começar</p>
      </div>
    );
  }

  const selectedRegister =
    selected !== null ? registers.find((r) => r.id === selected) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="space-y-3">
        {registers.map((r) => (
          <Card
            key={r.id}
            className={`cursor-pointer hover:shadow-md transition-all ${selected === r.id ? "ring-2 ring-primary" : ""}`}
            onClick={() => setSelected(r.id === selected ? null : r.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold">Caixa #{r.id}</p>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    r.status === "open"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {r.status === "open" ? "Aberto" : "Fechado"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">👤 {r.operator}</p>
              <p className="text-xs text-muted-foreground">
                {fmtDate(r.openedAt)}
              </p>
              <p className="font-bold text-primary mt-1">
                {fmt(r.summary?.totalSales ?? 0)} vendidos
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="lg:col-span-2">
        {selectedRegister ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Resumo do Caixa #{selectedRegister.id} —{" "}
                {selectedRegister.operator}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Abertura</p>
                  <p className="font-medium">
                    {fmtDate(selectedRegister.openedAt)}
                  </p>
                </div>
                {selectedRegister.closedAt && (
                  <div>
                    <p className="text-muted-foreground">Fechamento</p>
                    <p className="font-medium">
                      {fmtDate(selectedRegister.closedAt)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Fundo inicial</p>
                  <p className="font-medium">
                    {fmt(selectedRegister.openingAmount)}
                  </p>
                </div>
                {selectedRegister.closingAmount !== null &&
                  selectedRegister.closingAmount !== undefined && (
                    <div>
                      <p className="text-muted-foreground">Valor contado</p>
                      <p className="font-medium">
                        {fmt(selectedRegister.closingAmount)}
                      </p>
                    </div>
                  )}
              </div>
              {selectedRegister.summary && (
                <div className="space-y-1.5 text-sm border-t pt-3">
                  {[
                    {
                      label: "Dinheiro",
                      value: selectedRegister.summary.totalCash,
                    },
                    { label: "PIX", value: selectedRegister.summary.totalPix },
                    {
                      label: "Crédito",
                      value: selectedRegister.summary.totalCredit,
                    },
                    {
                      label: "Débito",
                      value: selectedRegister.summary.totalDebit,
                    },
                    {
                      label: "Voucher",
                      value: selectedRegister.summary.totalVoucher,
                    },
                    {
                      label: "Online/Plataforma",
                      value: selectedRegister.summary.totalPlatform ?? 0,
                    },
                    {
                      label: "Recebido no caixa",
                      value:
                        selectedRegister.summary.totalRestaurantReceived ?? 0,
                    },
                  ]
                    .filter((x) => x.value > 0)
                    .map((x) => (
                      <div key={x.label} className="flex justify-between">
                        <span className="text-muted-foreground">{x.label}</span>
                        <span>{fmt(x.value)}</span>
                      </div>
                    ))}
                  <div className="flex justify-between font-bold border-t pt-1.5">
                    <span>Total Vendido</span>
                    <span className="text-primary">
                      {fmt(selectedRegister.summary.totalSales)}
                    </span>
                  </div>
                  {selectedRegister.summary.totalWithdrawals > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Sangrias</span>
                      <span>
                        - {fmt(selectedRegister.summary.totalWithdrawals)}
                      </span>
                    </div>
                  )}
                  {selectedRegister.closingAmount !== null &&
                    selectedRegister.closingAmount !== undefined && (
                      <div
                        className={`flex justify-between font-semibold border-t pt-1.5 ${
                          Math.abs(
                            selectedRegister.closingAmount -
                              selectedRegister.summary.expectedCash,
                          ) < 0.01
                            ? "text-green-600"
                            : selectedRegister.closingAmount >
                                selectedRegister.summary.expectedCash
                              ? "text-blue-600"
                              : "text-red-600"
                        }`}
                      >
                        <span>Diferença</span>
                        <span>
                          {fmt(
                            selectedRegister.closingAmount -
                              selectedRegister.summary.expectedCash,
                          )}
                        </span>
                      </div>
                    )}
                </div>
              )}
              {selectedRegister.closingNotes && (
                <p className="text-xs text-muted-foreground italic border-t pt-2">
                  💬 {selectedRegister.closingNotes}
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm py-16">
            Selecione um caixa para ver os detalhes
          </div>
        )}
      </div>
    </div>
  );
}
