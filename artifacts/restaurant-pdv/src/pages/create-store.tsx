import { FormEvent, useEffect, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  getAuthErrorMessage,
  hasStoreCreationAccess,
  useAuth,
  type CreateOwnStorePayload,
} from "@/lib/auth";
import { defaultPathForRole } from "@/lib/rbac";

const initialForm: CreateOwnStorePayload = {
  name: "",
  phone: "",
  email: "",
  cep: "",
  address: "",
  number: "",
  neighborhood: "",
  city: "",
  state: "",
  country: "Brasil",
  complement: "",
  tradeName: "",
};

type ViaCepResponse = {
  erro?: boolean;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

export default function CreateStorePage() {
  const {
    actor,
    createOwnStore,
    currentStore,
    entitlement,
    isAuthenticated,
    isLoading,
    platformRole,
  } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState<CreateOwnStorePayload>(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingCep, setIsFetchingCep] = useState(false);

  const cleanCep = form.cep.replace(/\D/g, "");

  useEffect(() => {
    if (cleanCep.length !== 8) return;

    const controller = new AbortController();
    setIsFetchingCep(true);

    fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as ViaCepResponse;
        if (data.erro) return;
        setForm((current) => ({
          ...current,
          address: data.logradouro || current.address,
          neighborhood: data.bairro || current.neighborhood,
          city: data.localidade || current.city,
          state: data.uf || current.state,
        }));
      })
      .catch(() => {
        // ViaCEP é auxiliar; se falhar, o usuário preenche manualmente.
      })
      .finally(() => setIsFetchingCep(false));

    return () => controller.abort();
  }, [cleanCep]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Carregando sessão...
      </div>
    );
  }

  if (!isAuthenticated) return <Redirect to="/login?next=%2Fcreate-store" />;
  if (platformRole) return <Redirect to="/admin-max" />;
  if (!hasStoreCreationAccess(entitlement)) return <Redirect to="/plans" />;
  if (currentStore && actor) {
    return <Redirect to={defaultPathForRole(actor.role)} />;
  }

  function updateField(field: keyof CreateOwnStorePayload, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await createOwnStore(form);
      toast({
        title: "Loja criada com sucesso. Complete as configurações para começar.",
      });
      navigate("/onboarding");
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.18),_transparent_34%),linear-gradient(135deg,_#111827,_#030712)] px-4 py-10 text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img
            src="/brand/gestor-max-logo.png"
            alt="Gestor Max"
            className="h-16 w-auto object-contain"
          />
          <h1 className="text-3xl font-bold">Criar minha loja</h1>
          <p className="text-sm text-zinc-300">
            Configure sua loja para começar a usar o Gestor Max
          </p>
        </div>

        <Card className="w-full border-white/10 bg-white/95 text-slate-950 shadow-2xl shadow-black/30">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Store className="h-5 w-5" />
            </div>
            <CardTitle>Dados iniciais da loja</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <Field
                label="Nome da loja"
                value={form.name}
                onChange={(value) => updateField("name", value)}
                required
              />
              <Field
                label="Nome fantasia"
                value={form.tradeName ?? ""}
                onChange={(value) => updateField("tradeName", value)}
              />
              <Field
                label="Telefone"
                value={form.phone}
                onChange={(value) => updateField("phone", value)}
                required
              />
              <Field
                label="E-mail"
                type="email"
                value={form.email}
                onChange={(value) => updateField("email", value)}
                required
              />
              <Field
                label={isFetchingCep ? "CEP (buscando...)" : "CEP"}
                value={form.cep}
                onChange={(value) => updateField("cep", value)}
                required
              />
              <Field
                label="Endereço"
                value={form.address}
                onChange={(value) => updateField("address", value)}
                required
              />
              <Field
                label="Número"
                value={form.number}
                onChange={(value) => updateField("number", value)}
                required
              />
              <Field
                label="Complemento"
                value={form.complement ?? ""}
                onChange={(value) => updateField("complement", value)}
              />
              <Field
                label="Bairro"
                value={form.neighborhood}
                onChange={(value) => updateField("neighborhood", value)}
                required
              />
              <Field
                label="Cidade"
                value={form.city}
                onChange={(value) => updateField("city", value)}
                required
              />
              <Field
                label="Estado"
                value={form.state}
                onChange={(value) => updateField("state", value)}
                required
              />
              <Field
                label="País"
                value={form.country}
                onChange={(value) => updateField("country", value)}
                required
              />

              {error && (
                <div className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="md:col-span-2">
                <Button className="w-full" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    "Criar loja"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  const id = label.toLowerCase().replace(/\W+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </div>
  );
}
