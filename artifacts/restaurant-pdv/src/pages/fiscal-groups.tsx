import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  FileText,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Tags,
  X,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FiscalGroup = {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  documentDescription: string;
  allowAggregation: boolean;
  ncm: string;
  cest: string;
  cfop: string;
  commercialUnit: string;
  origin: string;
  icmsCode: string;
  pisCode: string;
  cofinsCode: string;
  natureOperation: string;
  productCount: number;
  ready: boolean;
  missing: string[];
};

type FiscalProduct = {
  id: number;
  name: string;
  active: boolean;
  available: boolean;
  categoryName: string;
  fiscalGroupId: number | null;
  fiscalGroupName: string | null;
};

type FiscalCatalog = {
  itemizationMode: "simplified" | "complete";
  groups: FiscalGroup[];
  products: FiscalProduct[];
  summary: {
    totalGroups: number;
    readyGroups: number;
    totalActiveProducts: number;
    assignedProducts: number;
    unassignedProducts: number;
    incompleteUsedGroups: number;
    ready: boolean;
  };
};

type ApiError = {
  error?: string;
  code?: string;
  fields?: Array<{ field: string; message: string }>;
};

type GroupForm = {
  name: string;
  description: string;
  documentDescription: string;
  allowAggregation: boolean;
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

const emptyGroupForm: GroupForm = {
  name: "",
  description: "",
  documentDescription: "",
  allowAggregation: true,
  ncm: "",
  cest: "",
  cfop: "",
  commercialUnit: "UN",
  origin: "0",
  icmsCode: "",
  pisCode: "",
  cofinsCode: "",
  natureOperation: "",
};

const onlyDigits = (value: string, maxLength: number): string =>
  value.replace(/\D/g, "").slice(0, maxLength);

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
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

export default function FiscalGroupsPage() {
  const [catalog, setCatalog] = useState<FiscalCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"groups" | "products">("groups");
  const [showForm, setShowForm] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroupForm);
  const [search, setSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [selectedGroupId, setSelectedGroupId] = useState("");

  async function loadCatalog() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/fiscal/catalog", {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as FiscalCatalog | ApiError;
      if (!response.ok) throw data;
      setCatalog(data as FiscalCatalog);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError.error || "Não foi possível carregar os grupos fiscais.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
  }, []);

  const visibleProducts = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!catalog) return [];
    if (!normalized) return catalog.products;
    return catalog.products.filter(
      (product) =>
        product.name.toLowerCase().includes(normalized) ||
        product.categoryName.toLowerCase().includes(normalized) ||
        product.fiscalGroupName?.toLowerCase().includes(normalized),
    );
  }, [catalog, search]);

  function updateGroupField<K extends keyof GroupForm>(field: K, value: GroupForm[K]) {
    setGroupForm((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  function resetGroupForm() {
    setEditingGroupId(null);
    setGroupForm(emptyGroupForm);
    setShowForm(false);
  }

  function editGroup(group: FiscalGroup) {
    setEditingGroupId(group.id);
    setGroupForm({
      name: group.name,
      description: group.description ?? "",
      documentDescription: group.documentDescription,
      allowAggregation: group.allowAggregation,
      ncm: group.ncm,
      cest: group.cest,
      cfop: group.cfop,
      commercialUnit: group.commercialUnit || "UN",
      origin: group.origin || "0",
      icmsCode: group.icmsCode,
      pisCode: group.pisCode,
      cofinsCode: group.cofinsCode,
      natureOperation: group.natureOperation,
    });
    setShowForm(true);
    setError(null);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function createSuggestedGroups() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/fiscal/groups/suggested", {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as
        | (FiscalCatalog & { message?: string })
        | ApiError;
      if (!response.ok) throw data;
      const result = data as FiscalCatalog & { message?: string };
      setCatalog(result);
      setNotice(result.message || "Grupos sugeridos criados.");
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError.error || "Não foi possível criar os grupos sugeridos.");
    } finally {
      setSaving(false);
    }
  }

  async function saveGroup() {
    if (!groupForm.name.trim()) {
      setError("Informe o nome do grupo fiscal.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        editingGroupId ? `/api/fiscal/groups/${editingGroupId}` : "/api/fiscal/groups",
        {
          method: editingGroupId ? "PUT" : "POST",
          credentials: "include",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(groupForm),
        },
      );
      const data = (await response.json().catch(() => ({}))) as
        | (FiscalCatalog & { message?: string })
        | ApiError;
      if (!response.ok) throw data;
      const result = data as FiscalCatalog & { message?: string };
      setCatalog(result);
      setNotice(result.message || "Grupo fiscal salvo.");
      resetGroupForm();
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError.fields?.[0]?.message || apiError.error || "Não foi possível salvar o grupo fiscal.");
    } finally {
      setSaving(false);
    }
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
      const allSelected = visibleProducts.every((product) => next.has(product.id));
      for (const product of visibleProducts) {
        if (allSelected) next.delete(product.id);
        else next.add(product.id);
      }
      return next;
    });
  }

  async function assignProducts() {
    if (selectedProducts.size === 0) {
      setError("Selecione pelo menos um produto.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/fiscal/products/group", {
        method: "PUT",
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          productIds: [...selectedProducts],
          fiscalGroupId: selectedGroupId ? Number(selectedGroupId) : null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as
        | (FiscalCatalog & { message?: string })
        | ApiError;
      if (!response.ok) throw data;
      const result = data as FiscalCatalog & { message?: string };
      setCatalog(result);
      setSelectedProducts(new Set());
      setNotice(result.message || "Produtos atualizados.");
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError.error || "Não foi possível vincular os produtos.");
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
              <Layers3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Grupos fiscais</h1>
              <p className="mt-1 text-muted-foreground">
                Organize regras fiscais e vincule os produtos do cardápio.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/fiscal">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Fiscal
            </Link>
          </Button>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong>Não invente códigos tributários.</strong> Use XMLs anteriores ou confirme NCM,
              CFOP, CEST, CST/CSOSN, PIS e COFINS com o contador. Os grupos sugeridos criam somente
              a organização; os códigos ficam em branco.
            </div>
          </div>
        </div>

        {loading && (
          <Card>
            <CardContent className="flex min-h-48 items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando cadastro fiscal...
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

        {!loading && catalog && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Modelo fiscal</div>
                  <div className="mt-1 font-semibold">
                    {catalog.itemizationMode === "complete" ? "Completo" : "Simplificado"}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Grupos completos</div>
                  <div className="mt-1 font-semibold">
                    {catalog.summary.readyGroups} de {catalog.summary.totalGroups}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Produtos vinculados</div>
                  <div className="mt-1 font-semibold">
                    {catalog.summary.assignedProducts} de {catalog.summary.totalActiveProducts}
                  </div>
                </CardContent>
              </Card>
              <Card className={catalog.summary.ready ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Situação desta etapa</div>
                  <div className="mt-1 font-semibold">
                    {catalog.summary.ready ? "Pronta" : "Com pendências"}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex gap-2 rounded-xl border bg-card p-2">
              <Button
                type="button"
                variant={tab === "groups" ? "default" : "ghost"}
                className="gap-2"
                onClick={() => setTab("groups")}
              >
                <Tags className="h-4 w-4" />
                Grupos fiscais
              </Button>
              <Button
                type="button"
                variant={tab === "products" ? "default" : "ghost"}
                className="gap-2"
                onClick={() => setTab("products")}
              >
                <FileText className="h-4 w-4" />
                Produtos
                {catalog.summary.unassignedProducts > 0 && (
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-700">
                    {catalog.summary.unassignedProducts}
                  </span>
                )}
              </Button>
            </div>

            {tab === "groups" && (
              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="gap-2"
                    onClick={() => {
                      setEditingGroupId(null);
                      setGroupForm(emptyGroupForm);
                      setShowForm(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Novo grupo fiscal
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={saving}
                    onClick={() => void createSuggestedGroups()}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Criar grupos sugeridos
                  </Button>
                </div>

                {showForm && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle>{editingGroupId ? "Editar grupo fiscal" : "Novo grupo fiscal"}</CardTitle>
                        <Button type="button" size="icon" variant="ghost" onClick={resetGroupForm}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field id="groupName" label="Nome do grupo">
                          <Input
                            id="groupName"
                            value={groupForm.name}
                            onChange={(event) => updateGroupField("name", event.target.value)}
                            placeholder="Ex.: Bebidas industrializadas"
                          />
                        </Field>
                        <Field
                          id="documentDescription"
                          label="Descrição na NFC-e simplificada"
                          hint="Ex.: Bebida. Necessária no modelo simplificado."
                        >
                          <Input
                            id="documentDescription"
                            value={groupForm.documentDescription}
                            onChange={(event) => updateGroupField("documentDescription", event.target.value)}
                          />
                        </Field>
                        <div className="md:col-span-2">
                          <Field id="groupDescription" label="Descrição interna">
                            <Input
                              id="groupDescription"
                              value={groupForm.description}
                              onChange={(event) => updateGroupField("description", event.target.value)}
                            />
                          </Field>
                        </div>
                      </div>

                      <div className="rounded-xl border p-4">
                        <label className="flex items-start gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={groupForm.allowAggregation}
                            onChange={(event) => updateGroupField("allowAggregation", event.target.checked)}
                            className="mt-1 h-4 w-4"
                          />
                          <span>
                            <strong>Permitir agrupamento no modelo simplificado</strong>
                            <span className="mt-1 block text-muted-foreground">
                              O agrupamento futuro só ocorrerá entre itens com regras fiscais compatíveis.
                            </span>
                          </span>
                        </label>
                      </div>

                      <div>
                        <h3 className="font-semibold">Regra fiscal padrão</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Os campos podem ser salvos incompletos, mas a etapa continuará pendente.
                        </p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Field id="ncm" label="NCM" hint="8 dígitos">
                          <Input
                            id="ncm"
                            inputMode="numeric"
                            value={groupForm.ncm}
                            onChange={(event) => updateGroupField("ncm", onlyDigits(event.target.value, 8))}
                          />
                        </Field>
                        <Field id="cest" label="CEST" hint="Opcional quando não aplicável">
                          <Input
                            id="cest"
                            inputMode="numeric"
                            value={groupForm.cest}
                            onChange={(event) => updateGroupField("cest", onlyDigits(event.target.value, 7))}
                          />
                        </Field>
                        <Field id="cfop" label="CFOP" hint="4 dígitos">
                          <Input
                            id="cfop"
                            inputMode="numeric"
                            value={groupForm.cfop}
                            onChange={(event) => updateGroupField("cfop", onlyDigits(event.target.value, 4))}
                          />
                        </Field>
                        <Field id="commercialUnit" label="Unidade comercial">
                          <Input
                            id="commercialUnit"
                            value={groupForm.commercialUnit}
                            onChange={(event) => updateGroupField("commercialUnit", event.target.value.toUpperCase().slice(0, 10))}
                            placeholder="UN"
                          />
                        </Field>
                        <Field id="origin" label="Origem" hint="Código de 0 a 8">
                          <Input
                            id="origin"
                            inputMode="numeric"
                            value={groupForm.origin}
                            onChange={(event) => updateGroupField("origin", onlyDigits(event.target.value, 1))}
                          />
                        </Field>
                        <Field id="icmsCode" label="CST ou CSOSN">
                          <Input
                            id="icmsCode"
                            inputMode="numeric"
                            value={groupForm.icmsCode}
                            onChange={(event) => updateGroupField("icmsCode", onlyDigits(event.target.value, 3))}
                          />
                        </Field>
                        <Field id="pisCode" label="CST PIS">
                          <Input
                            id="pisCode"
                            inputMode="numeric"
                            value={groupForm.pisCode}
                            onChange={(event) => updateGroupField("pisCode", onlyDigits(event.target.value, 2))}
                          />
                        </Field>
                        <Field id="cofinsCode" label="CST COFINS">
                          <Input
                            id="cofinsCode"
                            inputMode="numeric"
                            value={groupForm.cofinsCode}
                            onChange={(event) => updateGroupField("cofinsCode", onlyDigits(event.target.value, 2))}
                          />
                        </Field>
                        <div className="sm:col-span-2 lg:col-span-4">
                          <Field id="groupNatureOperation" label="Natureza da operação específica">
                            <Input
                              id="groupNatureOperation"
                              value={groupForm.natureOperation}
                              onChange={(event) => updateGroupField("natureOperation", event.target.value)}
                              placeholder="Deixe vazio para usar o padrão da loja"
                            />
                          </Field>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 border-t pt-5">
                        <Button type="button" variant="ghost" onClick={resetGroupForm} disabled={saving}>
                          Cancelar
                        </Button>
                        <Button type="button" className="gap-2" onClick={() => void saveGroup()} disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Salvar grupo
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {catalog.groups.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Layers3 className="mx-auto h-10 w-10 text-muted-foreground" />
                      <h3 className="mt-3 font-semibold">Nenhum grupo fiscal cadastrado</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Crie os grupos manualmente ou use a estrutura sugerida para começar.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {catalog.groups.map((group) => (
                      <Card key={group.id} className={group.ready ? "border-emerald-500/30" : "border-amber-500/30"}>
                        <CardHeader>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-lg">{group.name}</CardTitle>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {group.description || "Sem descrição interna"}
                              </p>
                            </div>
                            <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => editGroup(group)}>
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border px-2.5 py-1">
                              {group.productCount} produto{group.productCount === 1 ? "" : "s"}
                            </span>
                            <span className="rounded-full border px-2.5 py-1">
                              NFC-e: {group.documentDescription || "não definida"}
                            </span>
                            <span className="rounded-full border px-2.5 py-1">
                              {group.allowAggregation ? "Agrupamento permitido" : "Sem agrupamento"}
                            </span>
                          </div>
                          {group.ready ? (
                            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="h-4 w-4" />
                              Regra fiscal básica completa
                            </div>
                          ) : (
                            <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                              <div className="flex items-center gap-2 font-medium">
                                <AlertTriangle className="h-4 w-4" />
                                Campos pendentes
                              </div>
                              <div className="mt-2 text-xs">{group.missing.join(" · ")}</div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "products" && (
              <div className="space-y-4">
                <Card>
                  <CardContent className="space-y-4 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="productSearch">Buscar produto</Label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="productSearch"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="pl-9"
                            placeholder="Nome, categoria ou grupo fiscal"
                          />
                        </div>
                      </div>
                      <div className="min-w-64 space-y-2">
                        <Label htmlFor="bulkGroup">Aplicar grupo aos selecionados</Label>
                        <select
                          id="bulkGroup"
                          value={selectedGroupId}
                          onChange={(event) => setSelectedGroupId(event.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="">Sem grupo fiscal</option>
                          {catalog.groups.filter((group) => group.active).map((group) => (
                            <option key={group.id} value={group.id}>{group.name}</option>
                          ))}
                        </select>
                      </div>
                      <Button type="button" className="gap-2" disabled={saving || selectedProducts.size === 0} onClick={() => void assignProducts()}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Aplicar a {selectedProducts.size || 0}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="overflow-x-auto p-0">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="w-12 p-4">
                            <input
                              type="checkbox"
                              checked={visibleProducts.length > 0 && visibleProducts.every((product) => selectedProducts.has(product.id))}
                              onChange={toggleAllVisible}
                              aria-label="Selecionar produtos visíveis"
                            />
                          </th>
                          <th className="p-4">Produto</th>
                          <th className="p-4">Categoria</th>
                          <th className="p-4">Grupo fiscal</th>
                          <th className="p-4">Situação</th>
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
                            <td className="p-4">
                              {product.fiscalGroupName ? (
                                <span className="rounded-full border px-2.5 py-1 text-xs">{product.fiscalGroupName}</span>
                              ) : (
                                <span className="text-amber-700">Não vinculado</span>
                              )}
                            </td>
                            <td className="p-4 text-xs text-muted-foreground">
                              {!product.active ? "Inativo" : product.available ? "Ativo" : "Indisponível"}
                            </td>
                          </tr>
                        ))}
                        {visibleProducts.length === 0 && (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-muted-foreground">
                              Nenhum produto encontrado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
