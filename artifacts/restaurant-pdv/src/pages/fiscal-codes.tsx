import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  CircleAlert,
  Code2,
  Loader2,
  Pencil,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Option = { code: string; label: string; description?: string };
type CestOption = Option & {
  ncmPrefixes: string[];
  packagingNote?: string;
};
type NcmPreset = {
  id: string;
  segment: string;
  label: string;
  ncm: string;
  officialDescription: string;
  defaultUnit: string;
  keywords: string[];
  usageNote: string;
  validationLevel: "high" | "medium";
  source: string;
};

type FiscalLibrary = {
  version: string;
  warning: string;
  ncmPresets: NcmPreset[];
  cestOptions: CestOption[];
  cfopOptions: Option[];
  originOptions: Option[];
  icmsOptions: Option[];
  icmsLabel: string;
  pisOptions: Option[];
  cofinsOptions: Option[];
  unitOptions: Option[];
};

type FiscalProduct = {
  id: number;
  name: string;
  active: boolean;
  available: boolean;
  categoryName: string;
  fiscalGroupId: number | null;
  ncm: string;
  cest: string;
  cfop: string;
  commercialUnit: string;
  origin: string;
  icmsCode: string;
  pisCode: string;
  cofinsCode: string;
  natureOperation: string;
  ruleSource: "library" | "manual" | null;
  libraryPresetId: string | null;
  validationStatus: string | null;
  ruleComplete: boolean;
};

type LibraryResponse = {
  taxRegime: string;
  library: FiscalLibrary;
  products: FiscalProduct[];
  summary: {
    totalActiveProducts: number;
    completeRules: number;
    pendingRules: number;
    pendingValidation: number;
  };
};

type RuleForm = {
  source: "library" | "manual";
  libraryPresetId: string;
  ncm: string;
  cest: string;
  cfop: string;
  commercialUnit: string;
  origin: string;
  icmsCode: string;
  pisCode: string;
  cofinsCode: string;
  natureOperation: string;
};

const emptyRule: RuleForm = {
  source: "library",
  libraryPresetId: "",
  ncm: "",
  cest: "",
  cfop: "",
  commercialUnit: "UN",
  origin: "0",
  icmsCode: "",
  pisCode: "",
  cofinsCode: "",
  natureOperation: "Venda de mercadoria",
};

type ApiError = {
  error?: string;
  fields?: string[];
};

function onlyDigits(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function formatCode(code: string): string {
  if (code.length === 8) return `${code.slice(0, 4)}.${code.slice(4, 6)}.${code.slice(6)}`;
  if (code.length === 7) return `${code.slice(0, 2)}.${code.slice(2, 5)}.${code.slice(5)}`;
  return code;
}

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SelectField({
  id,
  value,
  options,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  options: Option[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.code} value={option.code}>
          {option.code} — {option.label}
        </option>
      ))}
    </select>
  );
}

export default function FiscalCodesPage() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [showEditor, setShowEditor] = useState(false);
  const [rule, setRule] = useState<RuleForm>(emptyRule);

  async function loadLibrary() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/fiscal/code-library", {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const result = (await response.json().catch(() => ({}))) as LibraryResponse | ApiError;
      if (!response.ok) throw result;
      setData(result as LibraryResponse);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError.error || "Não foi possível carregar a biblioteca fiscal.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLibrary();
  }, []);

  const visibleProducts = useMemo(() => {
    if (!data) return [];
    const search = productSearch.trim().toLowerCase();
    if (!search) return data.products;
    return data.products.filter(
      (product) =>
        product.name.toLowerCase().includes(search) ||
        product.categoryName.toLowerCase().includes(search) ||
        product.ncm.includes(search),
    );
  }, [data, productSearch]);

  const visiblePresets = useMemo(() => {
    if (!data) return [];
    const search = librarySearch.trim().toLowerCase();
    if (!search) return data.library.ncmPresets;
    return data.library.ncmPresets.filter((preset) =>
      [
        preset.segment,
        preset.label,
        preset.ncm,
        preset.officialDescription,
        ...preset.keywords,
      ].some((value) => value.toLowerCase().includes(search)),
    );
  }, [data, librarySearch]);

  const compatibleCestOptions = useMemo(() => {
    if (!data || !rule.ncm) return [];
    return data.library.cestOptions.filter((option) =>
      option.ncmPrefixes.some((prefix) => rule.ncm.startsWith(prefix)),
    );
  }, [data, rule.ncm]);

  function updateRule<K extends keyof RuleForm>(field: K, value: RuleForm[K]) {
    setRule((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  function choosePreset(preset: NcmPreset) {
    setRule((current) => ({
      ...current,
      source: "library",
      libraryPresetId: preset.id,
      ncm: preset.ncm,
      commercialUnit: preset.defaultUnit,
      cest: "",
    }));
    setError(null);
  }

  function toggleProduct(productId: number) {
    setSelectedProducts((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedProducts((current) => {
      const next = new Set(current);
      const allSelected =
        visibleProducts.length > 0 &&
        visibleProducts.every((product) => next.has(product.id));
      for (const product of visibleProducts) {
        if (allSelected) next.delete(product.id);
        else next.add(product.id);
      }
      return next;
    });
  }

  function openBulkEditor() {
    if (selectedProducts.size === 0) {
      setError("Selecione pelo menos um produto.");
      return;
    }
    setRule(emptyRule);
    setShowEditor(true);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editProduct(product: FiscalProduct) {
    setSelectedProducts(new Set([product.id]));
    setRule({
      source: product.ruleSource ?? "manual",
      libraryPresetId: product.libraryPresetId ?? "",
      ncm: product.ncm,
      cest: product.cest,
      cfop: product.cfop,
      commercialUnit: product.commercialUnit || "UN",
      origin: product.origin || "0",
      icmsCode: product.icmsCode,
      pisCode: product.pisCode,
      cofinsCode: product.cofinsCode,
      natureOperation: product.natureOperation || "Venda de mercadoria",
    });
    setShowEditor(true);
    setNotice(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function applyRule() {
    if (selectedProducts.size === 0) {
      setError("Selecione pelo menos um produto.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/fiscal/product-rules", {
        method: "PUT",
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ productIds: [...selectedProducts], ...rule }),
      });
      const result = (await response.json().catch(() => ({}))) as
        | { message: string; products: FiscalProduct[]; summary: LibraryResponse["summary"] }
        | ApiError;
      if (!response.ok) throw result;
      const success = result as {
        message: string;
        products: FiscalProduct[];
        summary: LibraryResponse["summary"];
      };
      setData((current) =>
        current
          ? { ...current, products: success.products, summary: success.summary }
          : current,
      );
      setNotice(success.message);
      setSelectedProducts(new Set());
      setShowEditor(false);
      setRule(emptyRule);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(
        apiError.fields?.[0] ||
          apiError.error ||
          "Não foi possível aplicar a regra fiscal.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <BookOpenCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Biblioteca de códigos</h1>
              <p className="mt-1 text-muted-foreground">
                Selecione produtos, escolha os códigos e preencha vários de uma vez.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/fiscal/groups">
              <ArrowLeft className="h-4 w-4" />
              Voltar aos grupos
            </Link>
          </Button>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong>Biblioteca de apoio, não decisão tributária automática.</strong> Os NCMs são
              candidatos comuns para alimentação. CFOP, CEST, CST/CSOSN, PIS e COFINS precisam ser
              conferidos com XMLs anteriores, contador e regras do estado antes da produção.
            </div>
          </div>
        </div>

        {loading && (
          <Card>
            <CardContent className="flex min-h-48 items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando biblioteca e produtos...
            </CardContent>
          </Card>
        )}

        {!loading && error && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!loading && notice && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {notice}
          </div>
        )}

        {!loading && data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Produtos ativos</div>
                  <div className="mt-1 text-xl font-semibold">{data.summary.totalActiveProducts}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Regras preenchidas</div>
                  <div className="mt-1 text-xl font-semibold">{data.summary.completeRules}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Sem regra completa</div>
                  <div className="mt-1 text-xl font-semibold">{data.summary.pendingRules}</div>
                </CardContent>
              </Card>
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Aguardando validação</div>
                  <div className="mt-1 text-xl font-semibold">{data.summary.pendingValidation}</div>
                </CardContent>
              </Card>
            </div>

            {showEditor && (
              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle>
                    Preencher códigos de {selectedProducts.size} produto
                    {selectedProducts.size === 1 ? "" : "s"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Todos os produtos selecionados receberão exatamente a mesma regra. Para uma
                    exceção, selecione apenas o produto diferente e use o modo manual.
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex gap-2 rounded-xl border bg-muted/20 p-2">
                    <Button
                      type="button"
                      variant={rule.source === "library" ? "default" : "ghost"}
                      className="gap-2"
                      onClick={() => updateRule("source", "library")}
                    >
                      <Sparkles className="h-4 w-4" />
                      Usar biblioteca
                    </Button>
                    <Button
                      type="button"
                      variant={rule.source === "manual" ? "default" : "ghost"}
                      className="gap-2"
                      onClick={() =>
                        setRule((current) => ({
                          ...current,
                          source: "manual",
                          libraryPresetId: "",
                        }))
                      }
                    >
                      <Pencil className="h-4 w-4" />
                      Preencher manualmente
                    </Button>
                  </div>

                  {rule.source === "library" ? (
                    <div className="space-y-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={librarySearch}
                          onChange={(event) => setLibrarySearch(event.target.value)}
                          className="pl-9"
                          placeholder="Buscar pizza, refeição, refrigerante, açaí, sorvete..."
                        />
                      </div>
                      <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border p-2">
                        {visiblePresets.map((preset) => {
                          const selected = rule.libraryPresetId === preset.id;
                          return (
                            <button
                              type="button"
                              key={preset.id}
                              onClick={() => choosePreset(preset)}
                              className={`w-full rounded-xl border p-4 text-left transition-colors ${
                                selected
                                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                                  : "hover:border-primary/40 hover:bg-muted/30"
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="text-xs font-medium text-primary">{preset.segment}</div>
                                  <div className="mt-1 font-semibold">{preset.label}</div>
                                  <div className="mt-1 text-sm text-muted-foreground">
                                    NCM {formatCode(preset.ncm)} · {preset.officialDescription}
                                  </div>
                                </div>
                                <span className="rounded-full border px-2.5 py-1 text-xs">
                                  {preset.validationLevel === "high"
                                    ? "Validação obrigatória"
                                    : "Confirmar antes de usar"}
                                </span>
                              </div>
                              <p className="mt-3 text-xs text-muted-foreground">{preset.usageNote}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
                      Digite os códigos confirmados pelo contador ou copiados de XMLs anteriores.
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Field id="ncm" label="NCM" hint="8 dígitos">
                      <Input
                        id="ncm"
                        inputMode="numeric"
                        value={rule.ncm}
                        readOnly={rule.source === "library"}
                        onChange={(event) => updateRule("ncm", onlyDigits(event.target.value, 8))}
                      />
                    </Field>
                    <Field id="cest" label="CEST" hint="Opcional quando não aplicável">
                      {rule.source === "library" && compatibleCestOptions.length > 0 ? (
                        <select
                          id="cest"
                          value={rule.cest}
                          onChange={(event) => updateRule("cest", event.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                        >
                          <option value="">Sem CEST / confirmar</option>
                          {compatibleCestOptions.map((option) => (
                            <option key={option.code} value={option.code}>
                              {formatCode(option.code)} — {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          id="cest"
                          inputMode="numeric"
                          value={rule.cest}
                          onChange={(event) => updateRule("cest", onlyDigits(event.target.value, 7))}
                        />
                      )}
                    </Field>
                    <Field id="cfop" label="CFOP">
                      {rule.source === "library" ? (
                        <SelectField
                          id="cfop"
                          value={rule.cfop}
                          options={data.library.cfopOptions}
                          placeholder="Selecione o CFOP"
                          onChange={(value) => updateRule("cfop", value)}
                        />
                      ) : (
                        <Input
                          id="cfop"
                          inputMode="numeric"
                          value={rule.cfop}
                          onChange={(event) => updateRule("cfop", onlyDigits(event.target.value, 4))}
                        />
                      )}
                    </Field>
                    <Field id="unit" label="Unidade comercial">
                      {rule.source === "library" ? (
                        <SelectField
                          id="unit"
                          value={rule.commercialUnit}
                          options={data.library.unitOptions}
                          placeholder="Selecione a unidade"
                          onChange={(value) => updateRule("commercialUnit", value)}
                        />
                      ) : (
                        <Input
                          id="unit"
                          value={rule.commercialUnit}
                          onChange={(event) =>
                            updateRule("commercialUnit", event.target.value.toUpperCase().slice(0, 10))
                          }
                        />
                      )}
                    </Field>
                    <Field id="origin" label="Origem da mercadoria">
                      {rule.source === "library" ? (
                        <SelectField
                          id="origin"
                          value={rule.origin}
                          options={data.library.originOptions}
                          placeholder="Selecione a origem"
                          onChange={(value) => updateRule("origin", value)}
                        />
                      ) : (
                        <Input
                          id="origin"
                          inputMode="numeric"
                          value={rule.origin}
                          onChange={(event) => updateRule("origin", onlyDigits(event.target.value, 1))}
                        />
                      )}
                    </Field>
                    <Field id="icms" label={data.library.icmsLabel}>
                      {rule.source === "library" ? (
                        <SelectField
                          id="icms"
                          value={rule.icmsCode}
                          options={data.library.icmsOptions}
                          placeholder={`Selecione ${data.library.icmsLabel}`}
                          onChange={(value) => updateRule("icmsCode", value)}
                        />
                      ) : (
                        <Input
                          id="icms"
                          inputMode="numeric"
                          value={rule.icmsCode}
                          onChange={(event) => updateRule("icmsCode", onlyDigits(event.target.value, 3))}
                        />
                      )}
                    </Field>
                    <Field id="pis" label="CST PIS">
                      {rule.source === "library" ? (
                        <SelectField
                          id="pis"
                          value={rule.pisCode}
                          options={data.library.pisOptions}
                          placeholder="Selecione o CST PIS"
                          onChange={(value) => updateRule("pisCode", value)}
                        />
                      ) : (
                        <Input
                          id="pis"
                          inputMode="numeric"
                          value={rule.pisCode}
                          onChange={(event) => updateRule("pisCode", onlyDigits(event.target.value, 2))}
                        />
                      )}
                    </Field>
                    <Field id="cofins" label="CST COFINS">
                      {rule.source === "library" ? (
                        <SelectField
                          id="cofins"
                          value={rule.cofinsCode}
                          options={data.library.cofinsOptions}
                          placeholder="Selecione o CST COFINS"
                          onChange={(value) => updateRule("cofinsCode", value)}
                        />
                      ) : (
                        <Input
                          id="cofins"
                          inputMode="numeric"
                          value={rule.cofinsCode}
                          onChange={(event) => updateRule("cofinsCode", onlyDigits(event.target.value, 2))}
                        />
                      )}
                    </Field>
                    <Field id="nature" label="Natureza da operação">
                      <Input
                        id="nature"
                        value={rule.natureOperation}
                        onChange={(event) => updateRule("natureOperation", event.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                    Após salvar, a regra ficará marcada como <strong>pendente de validação do contador</strong>.
                    Ela não libera produção nem emissão automática.
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t pt-5">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setShowEditor(false);
                        setRule(emptyRule);
                      }}
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      className="gap-2"
                      onClick={() => void applyRule()}
                      disabled={saving}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Aplicar a {selectedProducts.size} produto
                      {selectedProducts.size === 1 ? "" : "s"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Produtos do cardápio</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Selecione todos os produtos que receberão os mesmos códigos.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="gap-2"
                    onClick={openBulkEditor}
                    disabled={selectedProducts.size === 0}
                  >
                    <Code2 className="h-4 w-4" />
                    Preencher códigos ({selectedProducts.size})
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    className="pl-9"
                    placeholder="Buscar produto, categoria ou NCM"
                  />
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="w-12 p-4">
                        <input
                          type="checkbox"
                          checked={
                            visibleProducts.length > 0 &&
                            visibleProducts.every((product) => selectedProducts.has(product.id))
                          }
                          onChange={toggleAllVisible}
                          aria-label="Selecionar todos os produtos visíveis"
                        />
                      </th>
                      <th className="p-4">Produto</th>
                      <th className="p-4">Categoria</th>
                      <th className="p-4">NCM</th>
                      <th className="p-4">CFOP</th>
                      <th className="p-4">Origem</th>
                      <th className="p-4">Situação</th>
                      <th className="p-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.map((product) => (
                      <tr key={product.id} className="border-b last:border-0">
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => toggleProduct(product.id)}
                            aria-label={`Selecionar ${product.name}`}
                          />
                        </td>
                        <td className="p-4 font-medium">{product.name}</td>
                        <td className="p-4 text-muted-foreground">{product.categoryName}</td>
                        <td className="p-4 font-mono text-xs">
                          {product.ncm ? formatCode(product.ncm) : "—"}
                        </td>
                        <td className="p-4 font-mono text-xs">{product.cfop || "—"}</td>
                        <td className="p-4 font-mono text-xs">{product.origin || "—"}</td>
                        <td className="p-4">
                          {product.ruleComplete ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Preenchida
                              </span>
                              <div className="text-[11px] text-amber-700">Aguardando validação</div>
                            </div>
                          ) : (
                            <span className="text-xs text-amber-700">Pendente</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() => editProduct(product)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {visibleProducts.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">
                          Nenhum produto encontrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
