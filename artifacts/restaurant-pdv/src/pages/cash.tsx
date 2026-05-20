import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useGetCurrentCashRegister,
  useOpenCashRegister,
  useCloseCashRegister,
  useAddCashMovement,
  useListCashRegisters,
  getGetCurrentCashRegisterQueryKey,
  getListCashRegistersQueryKey,
  type CashRegisterDetail,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  ArrowDownCircle,
  ArrowUpCircle,
  Plus,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function Cash() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"current" | "history">("current");

  const {
    data: currentRegister,
    isLoading: loadingCurrent,
    isError: noCashOpen,
  } = useGetCurrentCashRegister({
    query: {
      queryKey: getGetCurrentCashRegisterQueryKey(),
      retry: false,
      refetchInterval: 30_000,
    },
  });

  const { data: history, isLoading: loadingHistory } = useListCashRegisters({
    query: {
      queryKey: getListCashRegistersQueryKey(),
      enabled: tab === "history",
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetCurrentCashRegisterQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListCashRegistersQueryKey() });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Caixa</h1>
            <p className="text-muted-foreground mt-1">Controle de abertura, movimentações e fechamento</p>
          </div>
          <div className="flex gap-2">
            <Button variant={tab === "current" ? "default" : "outline"} onClick={() => setTab("current")}>
              <Banknote className="w-4 h-4 mr-2" /> Caixa Atual
            </Button>
            <Button variant={tab === "history" ? "default" : "outline"} onClick={() => setTab("history")}>
              <History className="w-4 h-4 mr-2" /> Histórico
            </Button>
          </div>
        </div>

        {tab === "current" && (
          <>
            {loadingCurrent ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
              </div>
            ) : noCashOpen ? (
              <OpenCashForm onSuccess={invalidate} />
            ) : currentRegister ? (
              <OpenRegisterView register={currentRegister} onSuccess={invalidate} />
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

function OpenCashForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [operator, setOperator] = useState("");
  const [openingAmount, setOpeningAmount] = useState("");
  const [notes, setNotes] = useState("");

  const openRegister = useOpenCashRegister({
    mutation: {
      onSuccess: () => {
        toast({ title: "✅ Caixa aberto com sucesso!" });
        onSuccess();
      },
      onError: () => {
        toast({ title: "Erro ao abrir caixa", variant: "destructive" });
      },
    },
  });

  const handleOpen = () => {
    if (!operator.trim()) {
      toast({ title: "Informe o nome do operador", variant: "destructive" });
      return;
    }
    openRegister.mutate({
      data: {
        operator: operator.trim(),
        openingAmount: parseFloat(openingAmount) || 0,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
    });
  };

  return (
    <div className="max-w-lg mx-auto">
      <Card className="border-2 border-dashed border-muted-foreground/30">
        <CardHeader className="text-center pb-3">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
            <LockKeyhole className="w-8 h-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">Caixa Fechado</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Abra o caixa para começar a registrar vendas e movimentações
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="operator">Nome do Operador *</Label>
            <Input
              id="operator"
              placeholder="Ex: João Silva"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              data-testid="input-operator"
            />
          </div>
          <div>
            <Label htmlFor="opening-amount">Valor Inicial em Caixa (R$)</Label>
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
            <p className="text-xs text-muted-foreground mt-1">Dinheiro em espécie já disponível no caixa</p>
          </div>
          <div>
            <Label htmlFor="open-notes">Observação (opcional)</Label>
            <Textarea
              id="open-notes"
              placeholder="Ex: Troco do dia anterior"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <Button
            className="w-full"
            size="lg"
            onClick={handleOpen}
            disabled={openRegister.isPending || !operator.trim()}
            data-testid="button-open-cash"
          >
            <UnlockKeyhole className="w-4 h-4 mr-2" />
            {openRegister.isPending ? "Abrindo..." : "Abrir Caixa"}
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
  register: NonNullable<ReturnType<typeof useGetCurrentCashRegister>["data"]>;
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
      onError: () => {
        toast({ title: "Erro ao fechar caixa", variant: "destructive" });
      },
    },
  });

  const addMovement = useAddCashMovement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentCashRegisterQueryKey() });
        toast({ title: "Movimentação registrada" });
      },
      onError: () => {
        toast({ title: "Erro ao registrar movimentação", variant: "destructive" });
      },
    },
  });

  const s = register.summary!;
  const diff = closingAmount ? parseFloat(closingAmount) - s.expectedCash : null;

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <Card className="border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/10">
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <div>
              <p className="font-bold text-green-800 dark:text-green-300">Caixa Aberto</p>
              <p className="text-xs text-green-700 dark:text-green-400">
                Operador: <strong>{register.operator}</strong> · Abertura: {fmtDate(register.openedAt)}
              </p>
              {register.notes && (
                <p className="text-xs text-green-600 dark:text-green-500 italic">💬 {register.notes}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <AddMovementDialog cashRegisterId={register.id} onAdd={addMovement} />
            <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" data-testid="button-close-cash">
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
                    <div className="flex justify-between"><span>Dinheiro em vendas</span><span>{fmt(s.totalCash)}</span></div>
                    <div className="flex justify-between"><span>Sangrias</span><span className="text-red-600">- {fmt(s.totalWithdrawals)}</span></div>
                    <div className="flex justify-between"><span>Suprimentos</span><span className="text-green-600">+ {fmt(s.totalSupplies)}</span></div>
                    <div className="flex justify-between font-bold border-t pt-2">
                      <span>Esperado em caixa</span><span>{fmt(s.expectedCash)}</span>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="closing-amount">Valor Contado em Caixa (R$) *</Label>
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
                      <div className={`mt-2 p-2 rounded text-sm font-semibold ${
                        Math.abs(diff) < 0.01 ? "bg-green-100 text-green-700" :
                        diff > 0 ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                      }`}>
                        {Math.abs(diff) < 0.01 ? "✅ Caixa conferido — sem diferença" :
                         diff > 0 ? `↑ Sobra de ${fmt(diff)}` : `↓ Falta de ${fmt(Math.abs(diff))}`}
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
                        toast({ title: "Informe o valor contado em caixa", variant: "destructive" });
                        return;
                      }
                      closeRegister.mutate({
                        id: register.id,
                        data: {
                          closingAmount: parseFloat(closingAmount),
                          ...(closingNotes.trim() ? { closingNotes: closingNotes.trim() } : {}),
                        },
                      });
                    }}
                    disabled={closeRegister.isPending || !closingAmount}
                    data-testid="button-confirm-close"
                  >
                    {closeRegister.isPending ? "Fechando..." : "Confirmar Fechamento"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard label="Dinheiro" value={s.totalCash} icon={Banknote} color="green" />
        <SummaryCard label="PIX" value={s.totalPix} icon={QrCode} color="blue" />
        <SummaryCard label="Crédito" value={s.totalCredit} icon={CreditCard} color="purple" />
        <SummaryCard label="Débito" value={s.totalDebit} icon={CreditCard} color="indigo" />
        <SummaryCard label="Voucher" value={s.totalVoucher} icon={Banknote} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-primary/30">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Vendido</p>
            <p className="text-3xl font-bold text-primary">{fmt(s.totalSales)}</p>
            <p className="text-xs text-muted-foreground mt-1">{register.movements?.filter((m) => m.type === "payment").length ?? 0} pagamentos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5 text-red-500" /> Sangrias</p>
            <p className="text-2xl font-bold text-red-600">{fmt(s.totalWithdrawals)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-green-500" /> Suprimentos</p>
            <p className="text-2xl font-bold text-green-600">{fmt(s.totalSupplies)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Expected cash */}
      <Card className="bg-muted/30">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Fundo inicial: {fmt(register.openingAmount)}</p>
            <p className="font-semibold text-lg">Saldo esperado em dinheiro no caixa</p>
          </div>
          <p className="text-2xl font-bold">{fmt(s.expectedCash)}</p>
        </CardContent>
      </Card>

      {/* Movements List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Movimentações ({register.movements?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!register.movements || register.movements.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">Nenhuma movimentação registrada</p>
          ) : (
            <div className="space-y-2">
              {[...register.movements].reverse().map((m) => {
                const Icon = MOVEMENT_TYPE_ICONS[m.type] ?? CreditCard;
                const isOut = m.type === "withdrawal";
                return (
                  <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-full ${isOut ? "bg-red-100 dark:bg-red-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
                        <Icon className={`w-4 h-4 ${isOut ? "text-red-600" : "text-green-600"}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {MOVEMENT_TYPE_LABELS[m.type]}
                          {m.paymentMethod ? ` · ${METHOD_LABELS[m.paymentMethod] ?? m.paymentMethod}` : ""}
                          {m.orderId ? ` · Pedido #${m.orderId}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">{m.reason}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {fmtDate(m.createdAt)}
                        </p>
                      </div>
                    </div>
                    <p className={`font-bold ${isOut ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>
                      {isOut ? "- " : "+ "}{fmt(m.amount)}
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

function AddMovementDialog({
  cashRegisterId,
  onAdd,
}: {
  cashRegisterId: number;
  onAdd: ReturnType<typeof useAddCashMovement>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"withdrawal" | "supply" | "manual_in">("withdrawal");
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
      }
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
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
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
  label, value, icon: Icon, color,
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
    orange: "text-orange-600 bg-orange-100 dark:bg-orange-900/30",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colors[color]}`}>
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
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
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

  const selectedRegister = selected !== null ? registers.find((r) => r.id === selected) : null;

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
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  r.status === "open"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                }`}>
                  {r.status === "open" ? "Aberto" : "Fechado"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">👤 {r.operator}</p>
              <p className="text-xs text-muted-foreground">{fmtDate(r.openedAt)}</p>
              <p className="font-bold text-primary mt-1">{fmt(r.summary?.totalSales ?? 0)} vendidos</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="lg:col-span-2">
        {selectedRegister ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Resumo do Caixa #{selectedRegister.id} — {selectedRegister.operator}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground">Abertura</p><p className="font-medium">{fmtDate(selectedRegister.openedAt)}</p></div>
                {selectedRegister.closedAt && <div><p className="text-muted-foreground">Fechamento</p><p className="font-medium">{fmtDate(selectedRegister.closedAt)}</p></div>}
                <div><p className="text-muted-foreground">Fundo inicial</p><p className="font-medium">{fmt(selectedRegister.openingAmount)}</p></div>
                {selectedRegister.closingAmount !== null && selectedRegister.closingAmount !== undefined && (
                  <div><p className="text-muted-foreground">Valor contado</p><p className="font-medium">{fmt(selectedRegister.closingAmount)}</p></div>
                )}
              </div>
              {selectedRegister.summary && (
                <div className="space-y-1.5 text-sm border-t pt-3">
                  {[
                    { label: "Dinheiro", value: selectedRegister.summary.totalCash },
                    { label: "PIX", value: selectedRegister.summary.totalPix },
                    { label: "Crédito", value: selectedRegister.summary.totalCredit },
                    { label: "Débito", value: selectedRegister.summary.totalDebit },
                    { label: "Voucher", value: selectedRegister.summary.totalVoucher },
                  ].filter((x) => x.value > 0).map((x) => (
                    <div key={x.label} className="flex justify-between">
                      <span className="text-muted-foreground">{x.label}</span>
                      <span>{fmt(x.value)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold border-t pt-1.5">
                    <span>Total Vendido</span><span className="text-primary">{fmt(selectedRegister.summary.totalSales)}</span>
                  </div>
                  {selectedRegister.summary.totalWithdrawals > 0 && (
                    <div className="flex justify-between text-red-600"><span>Sangrias</span><span>- {fmt(selectedRegister.summary.totalWithdrawals)}</span></div>
                  )}
                  {selectedRegister.closingAmount !== null && selectedRegister.closingAmount !== undefined && (
                    <div className={`flex justify-between font-semibold border-t pt-1.5 ${
                      Math.abs(selectedRegister.closingAmount - selectedRegister.summary.expectedCash) < 0.01 ? "text-green-600" :
                      selectedRegister.closingAmount > selectedRegister.summary.expectedCash ? "text-blue-600" : "text-red-600"
                    }`}>
                      <span>Diferença</span>
                      <span>{fmt(selectedRegister.closingAmount - selectedRegister.summary.expectedCash)}</span>
                    </div>
                  )}
                </div>
              )}
              {selectedRegister.closingNotes && (
                <p className="text-xs text-muted-foreground italic border-t pt-2">💬 {selectedRegister.closingNotes}</p>
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
