import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useListTables,
  getListTablesQueryKey,
  useUpdateTable,
  useCreateTable,
  useDeleteTable,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Plus, Users, Eye, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_CONFIG = {
  available: {
    label: "Livre",
    cardStyle: { borderColor: "rgba(34,197,94,0.35)", boxShadow: "0 0 14px 0 rgba(34,197,94,0.12)" },
    badgeClass: "bg-green-900/40 text-green-400 border border-green-700/50",
    numberClass: "text-green-400",
  },
  occupied: {
    label: "Ocupada",
    cardStyle: { borderColor: "rgba(250,204,21,0.35)", boxShadow: "0 0 14px 0 rgba(250,204,21,0.10)" },
    badgeClass: "bg-amber-900/40 text-amber-400 border border-amber-700/50",
    numberClass: "text-amber-400",
  },
  reserved: {
    label: "Reservada",
    cardStyle: { borderColor: "rgba(56,189,248,0.35)", boxShadow: "0 0 14px 0 rgba(56,189,248,0.10)" },
    badgeClass: "bg-sky-900/40 text-sky-400 border border-sky-700/50",
    numberClass: "text-sky-400",
  },
};

export default function Tables() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newTableOpen, setNewTableOpen] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newCapacity, setNewCapacity] = useState("4");

  const { data: tables, isLoading } = useListTables({ query: { queryKey: getListTablesQueryKey() } });

  const createTable = useCreateTable({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
        setNewTableOpen(false);
        setNewNumber("");
        setNewCapacity("4");
        toast({ title: "Mesa criada" });
      },
    },
  });

  const updateTable = useUpdateTable({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
      },
    },
  });

  const deleteTable = useDeleteTable({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
        toast({ title: "Mesa removida" });
      },
    },
  });

  const handleCreate = () => {
    if (!newNumber) return;
    createTable.mutate({ data: { number: parseInt(newNumber), capacity: parseInt(newCapacity) } });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Mesas</h1>
            <p className="text-muted-foreground mt-1">Visão geral do salão</p>
          </div>
          <Dialog open={newTableOpen} onOpenChange={setNewTableOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-table">
                <Plus className="w-4 h-4 mr-2" /> Nova Mesa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Mesa</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label htmlFor="table-number">Número da Mesa</Label>
                  <Input
                    id="table-number"
                    type="number"
                    value={newNumber}
                    onChange={(e) => setNewNumber(e.target.value)}
                    placeholder="Ex: 11"
                    data-testid="input-table-number"
                  />
                </div>
                <div>
                  <Label htmlFor="table-capacity">Capacidade</Label>
                  <Input
                    id="table-capacity"
                    type="number"
                    value={newCapacity}
                    onChange={(e) => setNewCapacity(e.target.value)}
                    placeholder="Ex: 4"
                    data-testid="input-table-capacity"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={createTable.isPending || !newNumber}
                  data-testid="button-create-table"
                >
                  Criar Mesa
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Legenda */}
        <div className="flex gap-5 text-sm">
          {Object.entries(STATUS_CONFIG).map(([, { label, badgeClass }]) => (
            <div key={label} className="flex items-center gap-2">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {tables?.map((table) => {
              const config = STATUS_CONFIG[table.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.available;
              return (
                <div
                  key={table.id}
                  className="rounded-xl border p-4 flex flex-col gap-2 cursor-pointer transition-all hover:brightness-110"
                  style={{
                    backgroundColor: "#FFFFFF",
                    color: "#0F172A",
                    border: "1px solid",
                    ...config.cardStyle,
                  }}
                  data-testid={`card-table-${table.id}`}
                  onClick={() => {
                    if (table.currentOrderId) {
                      setLocation(`/orders/${table.currentOrderId}`);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-black text-2xl ${config.numberClass}`}>
                      #{table.number}
                    </span>
                    {table.status !== "available" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (table.currentOrderId) setLocation(`/orders/${table.currentOrderId}`);
                        }}
                        data-testid={`button-view-order-${table.id}`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {table.status === "available" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTable.mutate({ id: table.id });
                        }}
                        data-testid={`button-delete-table-${table.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-sm text-[#9CA3AF]">
                    <Users className="w-3.5 h-3.5" />
                    <span>{table.capacity} lugares</span>
                  </div>

                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full self-start ${config.badgeClass}`}>
                    {config.label}
                  </span>

                  {table.status === "available" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 text-xs h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocation(`/orders/new?tableId=${table.id}`);
                      }}
                      data-testid={`button-open-order-${table.id}`}
                    >
                      Abrir Pedido
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
