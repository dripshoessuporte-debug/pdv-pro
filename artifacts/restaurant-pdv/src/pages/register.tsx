import { FormEvent, useState } from "react";
import { Link } from "wouter";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", restaurantName: "", requestedPlan: "medio", message: "" });
  const [loading, setLoading] = useState(false); const [sent, setSent] = useState(false); const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/access-requests", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(form) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Não foi possível enviar sua solicitação agora. Tente novamente em instantes.");
        return;
      }
      setSent(true);
    } catch {
      setError("Não foi possível enviar sua solicitação agora. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }
  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.22),_transparent_32%),linear-gradient(135deg,_#111827,_#030712)] px-4 py-10 text-white"><div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-lg flex-col items-center justify-center"><img src="/brand/gestor-max-logo.png" alt="Gestor Max" className="mb-6 h-16 w-auto object-contain" /><Card className="w-full border-white/10 bg-white/95 text-slate-950"><CardHeader className="text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary"><Send className="h-5 w-5" /></div><CardTitle className="text-2xl">Solicite acesso ao Gestor Max</CardTitle><p className="text-sm text-slate-600">Cadastro operacional é liberado por pagamento Cakto ou aprovação do Admin Max.</p></CardHeader><CardContent>{sent ? <div className="space-y-4 text-center"><p className="rounded-lg bg-emerald-50 p-4 text-emerald-800">Solicitação enviada. Nenhuma conta, sessão ou loja foi criada automaticamente.</p><Button asChild><Link href="/plans">Ver planos</Link></Button></div> : <form className="space-y-4" onSubmit={submit}><div className="space-y-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} required /></div><div className="space-y-2"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required /></div><div className="space-y-2"><Label>Telefone</Label><Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required /></div><div className="space-y-2"><Label>Restaurante</Label><Input value={form.restaurantName} onChange={(e) => set("restaurantName", e.target.value)} required /></div><div className="space-y-2"><Label>Plano desejado</Label><Select value={form.requestedPlan} onValueChange={(v) => set("requestedPlan", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="basico">Gestor Max Start</SelectItem><SelectItem value="medio">Gestor Max Delivery</SelectItem><SelectItem value="pro">Gestor Max Pro</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Mensagem opcional</Label><Textarea value={form.message} onChange={(e) => set("message", e.target.value)} /></div>{error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}<Button className="w-full" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar solicitação</Button></form>}<p className="mt-5 text-center text-sm text-slate-600">Já tenho conta <Link href="/login" className="font-semibold text-primary hover:underline">Entrar</Link></p></CardContent></Card></div></main>;
}
