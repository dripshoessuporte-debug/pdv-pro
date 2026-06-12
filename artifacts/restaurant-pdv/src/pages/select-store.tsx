import { useState } from "react";
import { Redirect, useLocation } from "wouter";
import { ArrowRight, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth, getAuthErrorMessage, type AuthStore } from "@/lib/auth";
import { defaultPathForRole } from "@/lib/rbac";

const roleLabels: Record<AuthStore["role"], string> = {
  max_control: "Max Control",
  atendente: "Atendente",
  cozinha: "Cozinha",
  motoboy: "Motoboy",
};

export default function SelectStorePage() {
  const { stores, currentStore, isAuthenticated, isLoading, selectStore } =
    useAuth();
  const [, navigate] = useLocation();
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Carregando sessão...
      </div>
    );
  }

  if (!isAuthenticated) return <Redirect to="/login" />;
  if (currentStore) return <Redirect to={defaultPathForRole(currentStore.role)} />;

  async function handleEnter(storeId: number) {
    setSelectedStoreId(storeId);
    setIsSubmitting(true);
    setError(null);
    try {
      const nextSession = await selectStore(storeId);
      if (nextSession.currentStore) {
        navigate(defaultPathForRole(nextSession.currentStore.role));
      }
    } catch (selectError) {
      setError(getAuthErrorMessage(selectError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-red-950/80 px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-4xl flex-col items-center justify-center gap-8">
        <img
          src="/brand/gestor-max-logo.png"
          alt="Gestor Max"
          className="h-16 w-auto max-w-[260px] object-contain"
        />

        <div className="w-full text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-red-200/80">
            Multi-loja
          </p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
            Escolha uma loja
          </h1>
          <p className="mt-3 text-sm text-zinc-300">
            Selecione em qual loja deseja operar agora. Sua função e seus dados
            serão carregados apenas para a loja escolhida.
          </p>
        </div>

        {error && (
          <div className="w-full rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="grid w-full gap-4 sm:grid-cols-2">
          {stores.map((store) => {
            const isSelected = selectedStoreId === store.id;
            return (
              <Card
                key={store.id}
                className={`border-white/10 bg-white/[0.07] text-white shadow-2xl shadow-black/20 backdrop-blur ${
                  isSelected ? "ring-2 ring-red-400" : ""
                }`}
              >
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/20 text-red-100">
                      <Store className="h-6 w-6" />
                    </div>
                    <Badge className="bg-white/10 text-zinc-100 hover:bg-white/10">
                      {roleLabels[store.role]}
                    </Badge>
                  </div>
                  <CardTitle className="text-xl">{store.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    type="button"
                    className="w-full gap-2"
                    disabled={isSubmitting}
                    onClick={() => void handleEnter(store.id)}
                  >
                    {isSubmitting && isSelected ? "Entrando..." : "Entrar"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </main>
  );
}
