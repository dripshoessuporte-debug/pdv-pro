import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useListCustomers,
  getListCustomersQueryKey,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, Phone, Mail, Pencil, Trash2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CustomerForm = {
  name: string;
  phone: string;
  email: string;
  notes: string;
};

const emptyForm: CustomerForm = { name: "", phone: "", email: "", notes: "" };

export default function Customers() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: customers, isLoading } = useListCustomers(
    search ? { search } : {},
    { query: { queryKey: getListCustomersQueryKey(search ? { search } : {}) } }
  );

  const create = useCreateCustomer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        setDialogOpen(false);
        setForm(emptyForm);
        toast({ title: "Cliente cadastrado" });
      },
    },
  });

  const update = useUpdateCustomer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        setDialogOpen(false);
        setEditingId(null);
        setForm(emptyForm);
        toast({ title: "Cliente atualizado" });
      },
    },
  });

  const remove = useDeleteCustomer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        toast({ title: "Cliente removido" });
      },
    },
  });

  const openEdit = (c: typeof customers extends Array<infer T> | undefined ? T : never) => {
    setEditingId(c.id);
    setForm({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", notes: c.notes ?? "" });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    const data = {
      name: form.name,
      ...(form.phone && { phone: form.phone }),
      ...(form.email && { email: form.email }),
      ...(form.notes && { notes: form.notes }),
    };
    if (editingId !== null) {
      update.mutate({ id: editingId, data });
    } else {
      create.mutate({ data });
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
            <p className="text-muted-foreground mt-1">Cadastro de clientes</p>
          </div>
          <Button
            onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}
            data-testid="button-new-customer"
          >
            <Plus className="w-4 h-4 mr-2" /> Novo Cliente
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-customer"
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : customers?.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-xl font-medium">Nenhum cliente encontrado</p>
            <p className="text-sm mt-1">Cadastre o primeiro cliente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {customers?.map((customer) => (
              <Card key={customer.id} data-testid={`card-customer-${customer.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold text-lg">{customer.name}</p>
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        {customer.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" /> {customer.phone}
                          </span>
                        )}
                        {customer.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5" /> {customer.email}
                          </span>
                        )}
                      </div>
                      {customer.notes && (
                        <p className="text-sm text-muted-foreground italic">{customer.notes}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(customer)}
                        data-testid={`button-edit-customer-${customer.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => remove.mutate({ id: customer.id })}
                        disabled={remove.isPending}
                        data-testid={`button-delete-customer-${customer.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="cname">Nome *</Label>
              <Input
                id="cname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="input-customer-name"
              />
            </div>
            <div>
              <Label htmlFor="cphone">Telefone</Label>
              <Input
                id="cphone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                data-testid="input-customer-phone"
              />
            </div>
            <div>
              <Label htmlFor="cemail">Email</Label>
              <Input
                id="cemail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                data-testid="input-customer-email"
              />
            </div>
            <div>
              <Label htmlFor="cnotes">Observacoes</Label>
              <Input
                id="cnotes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                data-testid="input-customer-notes"
              />
            </div>
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={create.isPending || update.isPending || !form.name.trim()}
              data-testid="button-submit-customer"
            >
              {editingId ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
