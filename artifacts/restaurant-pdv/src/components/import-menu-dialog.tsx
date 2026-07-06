import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  getListAddonGroupsQueryKey,
  getListCategoriesQueryKey,
  getListProductsQueryKey,
} from "@workspace/api-client-react";

type ImportMode = "upsert" | "skip" | "create_only" | "update_only";
type PreviewResponse = {
  ok: boolean;
  summary?: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    newCategories: number;
    newProducts: number;
    updateProducts: number;
    variantsToCreate: number;
    bordersToCreate: number;
    addonGroupsToCreate: number;
    addonOptionsToCreate: number;
    multissaborToConfigure?: number;
  };
  rows?: {
    rowNumber: number;
    status: string;
    action: string;
    category: string;
    product: string;
    price: number | null;
    warnings: { message: string }[];
  }[];
  errors?: { rowNumber: number; field: string; message: string }[];
  warnings?: { rowNumber: number; message: string }[];
};

type FullPreviewResponse = { ok: boolean; counters: Record<string, number>; errors?: { rowNumber: number; field: string; message: string }[]; rows?: { rowNumber: number; tipo: string; resumo: string }[] };

type ImportResponse = {
  ok: boolean;
  summary?: Record<string, number>;
  errors?: { message: string }[];
  warnings?: { message: string }[];
};

export function ImportMenuDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [csv, setCsv] = useState("");
  const [mode, setMode] = useState<ImportMode>("upsert");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fullCsv, setFullCsv] = useState("");
  const [fullPreview, setFullPreview] = useState<FullPreviewResponse | null>(null);
  const [fullBusy, setFullBusy] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fileSummary = useMemo(
    () => ({
      bytes: new Blob([csv]).size,
      lines: csv ? Math.max(csv.split(/\r\n|\n|\r/).length - 1, 0) : 0,
    }),
    [csv],
  );
  const hasCriticalErrors = Boolean(preview?.errors?.length);

  const downloadTemplate = () => {
    window.location.href = "/api/menu/import-template";
  };

  const downloadAdvancedTemplate = () => {
    window.location.href = "/api/menu/import-template/advanced";
  };

  const downloadFullTemplate = () => {
    window.location.href = "/api/menu/import-full-template";
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast({
        title: "Formato não suportado. Envie um arquivo CSV.",
        description: "XLSX será suportado em uma próxima versão.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 1024 * 1024) {
      toast({
        title: "Arquivo muito grande.",
        description: "O limite é 1MB por importação.",
        variant: "destructive",
      });
      return;
    }
    setFileName(file.name);
    setCsv(await file.text());
    setPreview(null);
  };

  const parseError = async (res: Response, fallback: string) => {
    try {
      const body = (await res.json()) as {
        error?: string;
        errors?: { message: string }[];
      };
      return body.error || body.errors?.[0]?.message || fallback;
    } catch {
      return fallback;
    }
  };

  const validate = async () => {
    if (!csv.trim()) {
      toast({ title: "A planilha está vazia.", variant: "destructive" });
      return;
    }
    if (/tipo_registro/i.test(csv.split(/\r?\n/, 1)[0] ?? "") && /grupo(;|,)|grupo_multisabor/i.test(csv.split(/\r?\n/, 1)[0] ?? "")) {
      toast({ title: "Este arquivo parece ser de Multisabor. Use a importação completa ou a aba Multisabor.", variant: "destructive" });
      return;
    }
    setValidating(true);
    try {
      const res = await fetch("/api/menu/import-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, mode }),
      });
      const body = (await res.json()) as PreviewResponse;
      setPreview(body);
      toast({
        title: res.ok
          ? "Planilha validada."
          : "Planilha contém erros críticos.",
        variant: res.ok ? "default" : "destructive",
      });
    } finally {
      setValidating(false);
    }
  };

  const importNow = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/menu/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, mode }),
      });
      if (!res.ok)
        throw new Error(await parseError(res, "Erro ao importar planilha."));
      const body = (await res.json()) as ImportResponse;
      queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["/api/menu/products"] });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
      queryClient.invalidateQueries({ queryKey: getListAddonGroupsQueryKey() });
      toast({
        title: "Importação concluída.",
        description: `Produtos criados: ${body.summary?.createdProducts ?? 0}; atualizados: ${body.summary?.updatedProducts ?? 0}.`,
      });
      setCsv("");
      setFileName("");
      setPreview(null);
      onOpenChange(false);
    } catch (error) {
      toast({
        title:
          error instanceof Error ? error.message : "Erro ao importar planilha.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };


  const readFullFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast({ title: "Formato não suportado. Envie um arquivo CSV.", variant: "destructive" });
      return;
    }
    setFullCsv(await file.text());
    setFullPreview(null);
  };

  const validateFull = async () => {
    if (!fullCsv.trim()) {
      toast({ title: "A importação completa está vazia.", variant: "destructive" });
      return;
    }
    setFullBusy(true);
    try {
      const res = await fetch("/api/menu/import-full-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: fullCsv }) });
      const body = (await res.json()) as FullPreviewResponse;
      setFullPreview(body);
      toast({ title: res.ok ? "Importação completa validada." : "Importação completa contém erros.", variant: res.ok ? "default" : "destructive" });
    } finally { setFullBusy(false); }
  };

  const importFullNow = async () => {
    setFullBusy(true);
    try {
      const res = await fetch("/api/menu/import-full", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: fullCsv }) });
      const body = (await res.json()) as FullPreviewResponse;
      if (!res.ok) { setFullPreview(body); throw new Error(body.errors?.[0]?.message ?? "Corrija os erros antes de importar."); }
      queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["/api/menu/products"] });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
      queryClient.invalidateQueries({ queryKey: getListAddonGroupsQueryKey() });
      toast({ title: "Importação completa concluída." });
      setFullCsv(""); setFullPreview(null); onOpenChange(false);
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Erro ao importar cardápio completo.", variant: "destructive" });
    } finally { setFullBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar cardápio por
            planilha
          </DialogTitle>
          <DialogDescription>
            Use o modelo simples para produtos comuns. O modelo avançado é
            opcional para pizzarias com tamanhos, complementos e multissabor.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            "1. Baixar modelo",
            "2. Enviar arquivo",
            "3. Pré-visualizar",
            "4. Confirmar",
          ].map((step) => (
            <div
              key={step}
              className="rounded-lg border bg-muted/40 p-3 text-sm font-medium"
            >
              {step}
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div>
                <h3 className="font-semibold">Instruções rápidas</h3>
                <p className="text-sm text-muted-foreground">
                  Modelo simples: categoria; produto; descricao; preco; sku;
                  ativo. O preço aceita vírgula, ponto, R$ e separador de
                  milhar. Máximo de 1000 linhas e 1MB.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={downloadTemplate}
              >
                <Download className="mr-2 h-4 w-4" /> Baixar modelo CSV
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={downloadAdvancedTemplate}
              >
                <Download className="mr-2 h-4 w-4" /> Baixar modelo avançado
              </Button>
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">Exemplo visual</p>
                <p>
                  <strong>Produto:</strong> Pizza Calabresa
                </p>
                <p>
                  <strong>Preço:</strong> 49,90 ou R$ 49,90
                </p>
                <p>
                  <strong>Ativo:</strong> sim, s, yes, true, 1, não, n, no,
                  false ou 0
                </p>
              </div>
              <div className="space-y-2">
                <Label>Modo de duplicidade</Label>
                <Select
                  value={mode}
                  onValueChange={(v) => {
                    setMode(v as ImportMode);
                    setPreview(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create_only">
                      Apenas criar novos
                    </SelectItem>
                    <SelectItem value="update_only">
                      Atualizar existentes
                    </SelectItem>
                    <SelectItem value="upsert">Criar e atualizar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Arquivo CSV</Label>
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => readFile(e.target.files?.[0])}
                />
                <p className="text-xs text-muted-foreground">
                  Formatos aceitos: CSV.{" "}
                  {fileName
                    ? `Arquivo: ${fileName} (${fileSummary.bytes} bytes)`
                    : "Nenhum arquivo selecionado."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <Label>Ou cole o CSV manualmente</Label>
              <Textarea
                rows={10}
                value={csv}
                onChange={(e) => {
                  setCsv(e.target.value);
                  setPreview(null);
                }}
                placeholder="categoria;produto;descricao;preco;sku;ativo\nPizzas;Pizza Calabresa;Molho, mussarela, calabresa e cebola;49,90;PIZ-CAL;sim"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{fileSummary.lines} linhas de dados estimadas</span>
                <span>{fileSummary.bytes} bytes</span>
              </div>
              <Button onClick={validate} disabled={validating || !csv.trim()}>
                <Upload className="mr-2 h-4 w-4" />{" "}
                {validating ? "Validando..." : "Validar planilha"}
              </Button>
            </CardContent>
          </Card>
        </div>



        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <h3 className="font-semibold">Importação completa</h3>
              <p className="text-sm text-muted-foreground">Use um único CSV para produtos simples, variações, adicionais e Multisabor genérico.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={downloadFullTemplate}>
                <Download className="mr-2 h-4 w-4" /> Baixar modelo completo
              </Button>
              <Input className="max-w-xs" type="file" accept=".csv,text/csv" onChange={(e) => readFullFile(e.target.files?.[0])} />
            </div>
            <Textarea rows={8} value={fullCsv} onChange={(e) => { setFullCsv(e.target.value); setFullPreview(null); }} placeholder="tipo_registro;categoria;produto;..." />
            <div className="flex flex-wrap gap-2">
              <Button onClick={validateFull} disabled={fullBusy || !fullCsv.trim()}>Pré-visualizar importação completa</Button>
              <Button onClick={importFullNow} disabled={fullBusy || !fullPreview?.ok}>Confirmar importação completa</Button>
            </div>
            {fullPreview?.counters ? (
              <div className="grid gap-2 md:grid-cols-4">
                {Object.entries(fullPreview.counters).map(([key, value]) => (
                  <Badge key={key} variant={key === "erros" && value ? "destructive" : "outline"}>{key}: {value}</Badge>
                ))}
              </div>
            ) : null}
            {fullPreview?.errors?.length ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-semibold text-destructive">Erros da importação completa</p>
                <ul className="max-h-32 overflow-auto">
                  {fullPreview.errors.map((e, i) => <li key={i}>Linha {e.rowNumber}: {e.message}</li>)}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {preview?.summary ? (
          <div className="grid gap-2 md:grid-cols-4">
            <Badge variant="outline">
              Válidas: {preview.summary.validRows}
            </Badge>
            <Badge
              variant={preview.summary.errorRows ? "destructive" : "outline"}
            >
              Erros: {preview.summary.errorRows}
            </Badge>
            <Badge variant="outline">
              Categorias novas: {preview.summary.newCategories}
            </Badge>
            <Badge variant="outline">
              Produtos criar/atualizar: {preview.summary.newProducts}/
              {preview.summary.updateProducts}
            </Badge>
            <Badge variant="outline">
              Tamanhos criados: {preview.summary.variantsToCreate}
            </Badge>
            <Badge variant="outline">
              Bordas criadas: {preview.summary.bordersToCreate}
            </Badge>
            <Badge variant="outline">
              Complementos criados: {preview.summary.addonGroupsToCreate}
            </Badge>
            <Badge variant="outline">
              Multissabor: {preview.summary.multissaborToConfigure ?? 0}
            </Badge>
            <Badge variant="outline">Total: {preview.summary.totalRows}</Badge>
          </div>
        ) : null}

        {preview?.errors?.length ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <h3 className="font-semibold text-destructive">Erros críticos</h3>
            <ul className="mt-2 max-h-36 overflow-auto text-sm">
              {preview.errors.map((e, i) => (
                <li key={i}>
                  {e.message.startsWith("Linha ")
                    ? e.message
                    : `Linha ${e.rowNumber || "arquivo"}: ${e.message}`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {preview?.warnings?.length ? (
          <div className="rounded-lg border bg-amber-50 p-4">
            <h3 className="font-semibold">Avisos</h3>
            <ul className="mt-2 max-h-28 overflow-auto text-sm">
              {preview.warnings.map((w, i) => (
                <li key={i}>
                  Linha {w.rowNumber}: {w.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {preview?.rows?.length ? (
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold">Pré-visualização</h3>
            <div className="mt-2 max-h-48 overflow-auto text-sm">
              {preview.rows.slice(0, 50).map((r) => (
                <div
                  key={r.rowNumber}
                  className="flex justify-between border-b py-1"
                >
                  <span>
                    Linha {r.rowNumber}: {r.category} / {r.product}
                  </span>
                  <Badge
                    variant={r.status === "valid" ? "outline" : "destructive"}
                  >
                    {r.action}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={importNow}
            disabled={!preview?.ok || hasCriticalErrors || importing}
          >
            {importing ? "Importando..." : "Importar agora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
