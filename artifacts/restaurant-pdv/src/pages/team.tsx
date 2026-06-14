import { useEffect, useMemo, useState } from "react";
import { Edit2, KeyRound, Plus, Power, RefreshCw, Users } from "lucide-react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { authFetchJson, getAuthErrorMessage } from "@/lib/auth";
import type { Role } from "@/lib/rbac";

const roleLabels: Record<Role, string> = {
  max_control: "Administrador",
  atendente: "Atendente",
  cozinha: "Cozinha",
  motoboy: "Motoboy",
};
const roleOptions = Object.keys(roleLabels) as Role[];

type TeamMember = {
  memberId: number;
  userId: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
};
type NewUserForm = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: Role | "";
};
const emptyForm: NewUserForm = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "",
};

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<NewUserForm>(emptyForm);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [resettingMember, setResettingMember] = useState<TeamMember | null>(
    null,
  );
  const [selectedRole, setSelectedRole] = useState<Role>("atendente");
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );

  async function loadTeam() {
    setIsLoading(true);
    try {
      setMembers(await authFetchJson<TeamMember[]>("/api/team"));
    } catch (error) {
      toast({ title: getAuthErrorMessage(error), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    void loadTeam();
  }, []);

  function validateForm(): string | null {
    if (!form.name.trim()) return "Nome completo é obrigatório.";
    if (!form.email.trim() || !validateEmail(form.email))
      return "Informe um e-mail válido.";
    if (!form.password) return "Senha inicial é obrigatória.";
    if (form.password !== form.confirmPassword)
      return "Confirmar senha precisa bater.";
    if (!form.role) return "Função é obrigatória.";
    return null;
  }

  async function createUser() {
    const error = validateForm();
    if (error) {
      toast({ title: error, variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await authFetchJson("/api/team", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
        }),
      });
      toast({ title: "Usuário criado com sucesso." });
      setDialogOpen(false);
      setForm(emptyForm);
      await loadTeam();
    } catch (error) {
      toast({ title: getAuthErrorMessage(error), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateRole() {
    if (!editingMember) return;
    setIsSubmitting(true);
    try {
      await authFetchJson(`/api/team/${editingMember.memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: selectedRole }),
      });
      toast({ title: "Função atualizada." });
      setEditingMember(null);
      await loadTeam();
    } catch (error) {
      toast({ title: getAuthErrorMessage(error), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleMember(member: TeamMember) {
    setIsSubmitting(true);
    try {
      await authFetchJson(
        `/api/team/${member.memberId}/${member.active ? "deactivate" : "activate"}`,
        { method: "POST" },
      );
      toast({
        title: member.active ? "Usuário desativado." : "Usuário ativado.",
      });
      await loadTeam();
    } catch (error) {
      toast({ title: getAuthErrorMessage(error), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resetPassword() {
    if (!resettingMember) return;
    if (!newPassword) {
      toast({ title: "Informe a nova senha.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await authFetchJson(
        `/api/team/${resettingMember.memberId}/reset-password`,
        { method: "POST", body: JSON.stringify({ password: newPassword }) },
      );
      toast({ title: "Senha redefinida." });
      setResettingMember(null);
      setNewPassword("");
    } catch (error) {
      toast({ title: getAuthErrorMessage(error), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Equipe</h1>
            <p className="mt-1 text-muted-foreground">
              Gerencie os acessos da sua loja
            </p>
          </div>
          <Button
            onClick={() => {
              setForm(emptyForm);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo usuário
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : sortedMembers.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <Users className="mx-auto mb-4 h-12 w-12 opacity-40" />
                <p>Nenhum usuário cadastrado.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMembers.map((member) => (
                    <TableRow key={member.memberId}>
                      <TableCell className="font-medium">
                        {member.name}
                      </TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>{roleLabels[member.role]}</TableCell>
                      <TableCell>
                        <Badge
                          variant={member.active ? "default" : "secondary"}
                        >
                          {member.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(member.createdAt).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingMember(member);
                              setSelectedRole(member.role);
                            }}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void toggleMember(member)}
                            disabled={isSubmitting}
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setResettingMember(member);
                              setNewPassword("");
                            }}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo usuário</DialogTitle>
              <DialogDescription>
                Crie um acesso para a equipe desta loja.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Nome completo</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Senha inicial</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Confirmar senha</Label>
                <Input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) =>
                    setForm({ ...form, confirmPassword: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Função</Label>
                <Select
                  value={form.role}
                  onValueChange={(role) =>
                    setForm({ ...form, role: role as Role })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a função" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((role) => (
                      <SelectItem key={role} value={role}>
                        {roleLabels[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void createUser()} disabled={isSubmitting}>
                Criar usuário
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(editingMember)}
          onOpenChange={(open) => !open && setEditingMember(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar função</DialogTitle>
              <DialogDescription>{editingMember?.name}</DialogDescription>
            </DialogHeader>
            <Select
              value={selectedRole}
              onValueChange={(role) => setSelectedRole(role as Role)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role} value={role}>
                    {roleLabels[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingMember(null)}>
                Cancelar
              </Button>
              <Button onClick={() => void updateRole()} disabled={isSubmitting}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(resettingMember)}
          onOpenChange={(open) => !open && setResettingMember(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Redefinir senha</DialogTitle>
              <DialogDescription>{resettingMember?.email}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setResettingMember(null)}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => void resetPassword()}
                disabled={isSubmitting}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Redefinir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
