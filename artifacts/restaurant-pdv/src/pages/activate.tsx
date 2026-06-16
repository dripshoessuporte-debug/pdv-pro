import { FormEvent, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ActivatePage() {
  const [, params] = useRoute("/activate/:token");
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 6 || password !== confirm) { setError("Informe uma senha de 6 caracteres e confirme corretamente."); return; }
    setLoading(true); setError(null);
    const response = await fetch("/api/auth/activation/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: params?.token, password }) });
    setLoading(false);
    if (!response.ok) { const data = await response.json().catch(() => ({})); setError(data.error || "Não foi possível ativar a conta."); return; }
    navigate("/login");
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white"><Card className="w-full max-w-md"><CardHeader><CardTitle>Definir senha do Gestor Max</CardTitle></CardHeader><CardContent><form className="space-y-4" onSubmit={submit}><div className="space-y-2"><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div><div className="space-y-2"><Label>Confirmar senha</Label><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>{error && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}<Button className="w-full" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ativar conta</Button></form></CardContent></Card></main>;
}
