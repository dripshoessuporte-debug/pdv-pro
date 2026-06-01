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
import { AlertTriangle, Plus, Users, Eye, Trash2, Utensils } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_CONFIG = {
  available: {
    label: "Livre",
    headerClass: "bg-emerald-600",
    cardClass: "border-emerald-200 bg-white hover:border-emerald-400",
    badgeClass: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  },
  occupied: {
    label: "Ocupada",
    headerClass: "bg-[#FF2A1F]",
    cardClass: "border-red-200 bg-red-50 hover:border-[#FF2A1F]",
    badgeClass: "bg-red-100 text-red-800 border border-red-300",
  },
  reserved: {
    label: "Reservada",
    headerClass: "bg-sky-600",
    cardClass: "border-sky-200 bg-sky-50 hover:border-sky-400",
    badgeClass: "bg-sky-100 text-sky-800 border border-sky-300",
  },
};

export default function Tables() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newTableOpen, setNewTableOpen] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newCapacity, setNewCapacity] = useState("4");

  const { data: tables, isLoading } = useListTables({
    query: { queryKey: getListTablesQueryKey() },
  });

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

  useUpdateTable({
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
    createTable.mutate({
      data: { number: parseInt(newNumber), capacity: parseInt(newCapacity) },
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Page header */}
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

        {/* Legend */}
        <div className="flex gap-3 text-sm flex-wrap">
          {Object.entries(STATUS_CONFIG).map(([, { label, badgeClass }]) => (
            <span
              key={label}
              className={`text-xs font-semibold px-3 py-1 rounded-full ${badgeClass}`}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {tables?.map((table) => {
              const config =
                STATUS_CONFIG[table.status as keyof typeof STATUS_CONFIG] ??
                STATUS_CONFIG.available;
              const isOccupied = table.status !== "available";

              return (
                <div
                  key={table.id}
                  className={`rounded-2xl border-2 overflow-hidden shadow-sm transition-all cursor-pointer flex flex-col ${config.cardClass}`}
                  data-testid={`card-table-${table.id}`}
                  onClick={() => {
                    if (table.currentOrderId) {
                      setLocation(`/orders/${table.currentOrderId}`);
                    } else if (table.status === "available") {
                      setLocation(`/orders/new?tableId=${table.id}`);
                    }
                  }}
                >
                  {/* Colored header strip */}
                  <div
                    className={`${config.headerClass} px-3 py-2.5 flex items-center justify-between`}
                  >
                    <span className="text-white font-black text-2xl leading-none">
                      #{table.number}
                    </span>
                    {isOccupied ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-white/80 hover:text-white hover:bg-white/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (table.currentOrderId)
                            setLocation(`/orders/${table.currentOrderId}`);
                        }}
                        data-testid={`button-view-order-${table.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-white/70 hover:text-white hover:bg-white/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTable.mutate({ id: table.id });
                        }}
                        data-testid={`button-delete-table-${table.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {/* Body */}
                  <div className="px-3 py-3 flex flex-col gap-2.5 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span>{table.capacity} lugares</span>
                    </div>

                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full self-start ${config.badgeClass}`}
                    >
                      {config.label}
                    </span>

                    {!isOccupied && (
                      <Button
                        size="sm"
                        className="mt-auto h-9 text-sm font-semibold w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocation(`/orders/new?tableId=${table.id}`);
                        }}
                        data-testid={`button-open-order-${table.id}`}
                      >
                        Abrir Comanda
                      </Button>
                    )}

                    {isOccupied && table.currentOrderId && (
                      <div className="mt-auto space-y-2">
                        {table.hasMultipleOpenOrders && (
                          <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-white px-2 py-1.5 text-[11px] font-medium text-red-700">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            Mais de uma comanda aberta; usando a mais recente.
                          </div>
                        )}
                        <Button
                          size="sm"
                          className="h-9 w-full rounded-xl bg-[#FF2A1F] text-sm font-semibold text-white hover:bg-[#D91F16]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/orders/${table.currentOrderId}`);
                          }}
                          data-testid={`button-add-items-${table.id}`}
                        >
                          <Utensils className="mr-2 h-4 w-4" />
                          Abrir / Adicionar itens
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
