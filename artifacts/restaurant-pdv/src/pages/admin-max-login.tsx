import { FormEvent, useEffect, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthErrorMessage, useAuth } from "@/lib/auth";

export default function AdminMaxLoginPage() {
  const { isAuthenticated, isLoading, login, platformRole } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setError(null);
  }, [email, password]);

  if (!isLoading && isAuthenticated && platformRole) {
    return <Redirect to="/admin-max" />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const session = await login(email, password, { redirect: false });
      if (!session.platformRole) {
        setError("Este usuário não possui acesso administrativo.");
        return;
      }
      navigate("/admin-max");
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.22),_transparent_34%),linear-gradient(135deg,_#0f172a,_#020617)] px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md flex-col items-center justify-center">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img
            src="/brand/gestor-max-logo.png"
            alt="Gestor Max"
            className="h-16 w-auto object-contain"
          />
          <p className="text-sm font-medium text-red-100">
            Acesso administrativo da plataforma
          </p>
        </div>

        <Card className="w-full border-white/10 bg-white/95 text-slate-950 shadow-2xl shadow-black/40">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <CardTitle className="text-2xl">Admin Max</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="admin-email">E-mail</Label>
                <Input
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  placeholder="dono@gestormax.local"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Senha</Label>
                <Input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button className="w-full" type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-zinc-400">
          Demo plataforma: dono@gestormax.local / admin123. Em produção, troque
          a senha imediatamente.
        </p>
      </div>
    </main>
  );
}
