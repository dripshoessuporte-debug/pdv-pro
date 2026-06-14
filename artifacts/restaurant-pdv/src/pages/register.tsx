import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Redirect } from "wouter";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getAuthErrorMessage, useAuth } from "@/lib/auth";
import { defaultPathForRole } from "@/lib/rbac";

const minimumPasswordLength = 6;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

export default function RegisterPage() {
  const { actor, isAuthenticated, isLoading, platformRole, register } =
    useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setError(null);
  }, [acceptedTerms, confirmPassword, email, name, password, phone]);

  const validationError = useMemo(() => {
    if (!name.trim()) return "Informe seu nome completo.";
    if (!email.trim() || !isValidEmail(email)) {
      return "Informe um e-mail válido.";
    }
    if (password.length < minimumPasswordLength) {
      return `A senha deve ter pelo menos ${minimumPasswordLength} caracteres.`;
    }
    if (confirmPassword !== password) {
      return "A confirmação de senha precisa ser igual.";
    }
    if (!acceptedTerms) {
      return "Aceite os termos de uso e política de privacidade para continuar.";
    }
    return null;
  }, [acceptedTerms, confirmPassword, email, name, password]);

  if (!isLoading && isAuthenticated) {
    if (actor) return <Redirect to={defaultPathForRole(actor.role)} />;
    if (platformRole) return <Redirect to="/admin-max" />;
    return <Redirect to="/create-store" />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim() || undefined,
      });
      toast({ title: "Conta criada com sucesso. Agora configure sua loja." });
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.22),_transparent_32%),linear-gradient(135deg,_#111827,_#030712)] px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md flex-col items-center justify-center">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img
            src="/brand/gestor-max-logo.png"
            alt="Gestor Max"
            className="h-16 w-auto object-contain"
          />
          <p className="text-sm text-zinc-300">
            Crie sua conta para configurar sua primeira loja no Gestor Max.
          </p>
        </div>

        <Card className="w-full border-white/10 bg-white/95 text-slate-950 shadow-2xl shadow-black/30">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserPlus className="h-5 w-5" />
            </div>
            <CardTitle className="text-2xl">Criar conta</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  placeholder="Cliente Novo"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="cliente@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone opcional</Label>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="(00) 00000-0000"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mínimo de 6 caracteres"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repita sua senha"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <Checkbox
                  checked={acceptedTerms}
                  onCheckedChange={(checked) =>
                    setAcceptedTerms(checked === true)
                  }
                  aria-label="Aceito os termos de uso e política de privacidade"
                />
                <span>Aceito os termos de uso e política de privacidade</span>
              </label>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button className="w-full" type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando conta...
                  </>
                ) : (
                  "Criar minha conta"
                )}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-600">
              Já tenho conta{" "}
              <Link
                href="/login"
                className="font-semibold text-primary hover:underline"
              >
                Entrar
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
