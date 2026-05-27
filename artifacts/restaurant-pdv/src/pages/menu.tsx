import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import {
  useListProducts,
  getListProductsQueryKey,
  useListCategories,
  getListCategoriesQueryKey,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useListProductVariants,
  getListProductVariantsQueryKey,
  useCreateProductVariant,
  useUpdateProductVariant,
  useDeleteProductVariant,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Pencil, Trash2, Tag, Eye, EyeOff, ToggleLeft, ToggleRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ProductForm = {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  available: boolean;
  sku: string;
  barcode: string;
  costPrice: string;
  unit: string;
  preparationTimeMinutes: string;
  trackStock: boolean;
  stockQty: string;
  stockMinQty: string;
  allowSaleWithoutStock: boolean;
  imageUrl: string;
  imageAlt: string;
};

const emptyProduct: ProductForm = {
  name: "",
  description: "",
  price: "",
  categoryId: "",
  available: true,
  sku: "",
  barcode: "",
  costPrice: "",
  unit: "unidade",
  preparationTimeMinutes: "",
  trackStock: false,
  stockQty: "",
  stockMinQty: "",
  allowSaleWithoutStock: false,
  imageUrl: "",
  imageAlt: "",
};

type CategoryForm = {
  name: string;
  description: string;
};
type VariantForm = {
  name: string;
  price: string;
  available: boolean;
};

export default function Menu() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [productDialog, setProductDialog] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyProduct);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({ name: "", description: "" });
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<{ id: number; name: string } | null>(null);
  const [variantForm, setVariantForm] = useState<VariantForm>({ name: "", price: "", available: true });
  const [editingVariantId, setEditingVariantId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const params = useMemo(() => {
    const query: Record<string, unknown> = {};
    if (search) query.search = search;
    if (selectedCategory !== "all") query.categoryId = parseInt(selectedCategory);
    if (showInactive) query.includeInactive = true;
    return query;
  }, [search, selectedCategory, showInactive]);

  const { data: products, isLoading: loadingProducts, error: productsError, isFetching: fetchingProducts } = useListProducts(params, {
    query: { queryKey: getListProductsQueryKey(params) },
  });

  const { data: categories } = useListCategories({
    query: { queryKey: getListCategoriesQueryKey() },
  });
  const { data: variants, isLoading: loadingVariants } = useListProductVariants(editingId ?? 0, {
    query: { enabled: editingId !== null, queryKey: getListProductVariantsQueryKey(editingId ?? 0) },
  });

  const invalidateProducts = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/menu/products"] });
  };
  const invalidateVariants = () => {
    if (editingId !== null) {
      queryClient.invalidateQueries({ queryKey: getListProductVariantsQueryKey(editingId) });
    }
  };

  const createProduct = useCreateProduct({
    mutation: {
      onSuccess: () => {
        invalidateProducts();
        setProductDialog(false);
        setForm(emptyProduct);
        toast({ title: "Produto criado com sucesso!" });
      },
      onError: (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: msg ?? "Erro ao criar produto.", variant: "destructive" });
      },
    },
  });

  const updateProduct = useUpdateProduct({
    mutation: {
      onSuccess: () => {
        invalidateProducts();
        setProductDialog(false);
        setEditingId(null);
        setForm(emptyProduct);
        toast({ title: "Produto atualizado com sucesso!" });
      },
      onError: (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: msg ?? "Erro ao atualizar produto.", variant: "destructive" });
      },
    },
  });

  const deleteProduct = useDeleteProduct({
    mutation: {
      onSuccess: (_data, variables) => {
        invalidateProducts();
        setDeleteTarget(null);
        // The API returns 200 with {softDeleted:true} or 204
        // The hook treats 204 as success too
        const response = _data as unknown as { softDeleted?: boolean } | undefined;
        if (response && typeof response === "object" && response.softDeleted) {
          toast({ title: "Produto desativado (já havia sido vendido, histórico preservado)." });
        } else {
          toast({ title: "Produto excluído." });
        }
      },
      onError: (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: msg ?? "Erro ao excluir produto.", variant: "destructive" });
      },
    },
  });

  const createCategory = useCreateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        setCategoryForm({ name: "", description: "" });
        toast({ title: "Categoria criada!" });
      },
      onError: (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: msg ?? "Erro ao criar categoria.", variant: "destructive" });
      },
    },
  });

  const updateCategory = useUpdateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        setEditingCategoryId(null);
        setCategoryForm({ name: "", description: "" });
        toast({ title: "Categoria atualizada!" });
      },
      onError: (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: msg ?? "Erro ao atualizar categoria.", variant: "destructive" });
      },
    },
  });

  const deleteCategory = useDeleteCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        setDeleteCategoryTarget(null);
        toast({ title: "Categoria removida." });
      },
      onError: (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: msg ?? "Erro ao remover categoria.", variant: "destructive" });
        setDeleteCategoryTarget(null);
      },
    },
  });
  const createVariant = useCreateProductVariant({
    mutation: {
      onSuccess: () => {
        invalidateVariants();
        setVariantForm({ name: "", price: "", available: true });
        toast({ title: "Variação adicionada." });
      },
      onError: (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: msg ?? "Erro ao adicionar variação.", variant: "destructive" });
      },
    },
  });
  const updateVariant = useUpdateProductVariant({
    mutation: {
      onSuccess: () => {
        invalidateVariants();
        setEditingVariantId(null);
        setVariantForm({ name: "", price: "", available: true });
        toast({ title: "Variação atualizada." });
      },
      onError: (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: msg ?? "Erro ao atualizar variação.", variant: "destructive" });
      },
    },
  });
  const deleteVariant = useDeleteProductVariant({
    mutation: {
      onSuccess: () => {
        invalidateVariants();
        toast({ title: "Variação removida." });
      },
      onError: (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: msg ?? "Erro ao remover variação.", variant: "destructive" });
      },
    },
  });
  const productsErrorMessage =
    (productsError as { response?: { data?: { error?: string } }; message?: string } | null)?.response?.data?.error ??
    (productsError as { message?: string } | null)?.message ??
    null;

  const openEdit = (p: NonNullable<typeof products>[number]) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      description: p.description ?? "",
      price: String(p.price),
      categoryId: String(p.categoryId),
      available: p.available,
      sku: p.sku ?? "",
      barcode: p.barcode ?? "",
      costPrice: p.costPrice != null ? String(p.costPrice) : "",
      unit: p.unit ?? "unidade",
      preparationTimeMinutes: p.preparationTimeMinutes != null ? String(p.preparationTimeMinutes) : "",
      trackStock: p.trackStock ?? false,
      stockQty: p.stockQty != null ? String(p.stockQty) : "",
      stockMinQty: p.stockMinQty != null ? String(p.stockMinQty) : "",
      allowSaleWithoutStock: p.allowSaleWithoutStock ?? false,
      imageUrl: p.imageUrl ?? "",
      imageAlt: p.imageAlt ?? "",
    });
    setProductDialog(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.price || !form.categoryId) return;
    const data = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      price: parseFloat(form.price),
      categoryId: parseInt(form.categoryId),
      available: form.available,
      sku: form.sku.trim() || undefined,
      barcode: form.barcode.trim() || undefined,
      costPrice: form.costPrice ? parseFloat(form.costPrice) : undefined,
      unit: form.unit.trim() || undefined,
      preparationTimeMinutes: form.preparationTimeMinutes ? parseInt(form.preparationTimeMinutes) : undefined,
      trackStock: form.trackStock,
      stockQty: form.trackStock && form.stockQty ? parseFloat(form.stockQty) : undefined,
      stockMinQty: form.trackStock && form.stockMinQty ? parseFloat(form.stockMinQty) : undefined,
      allowSaleWithoutStock: form.trackStock ? form.allowSaleWithoutStock : false,
      imageUrl: form.imageUrl.trim() || undefined,
      imageAlt: form.imageAlt.trim() || undefined,
    };
    if (editingId !== null) {
      updateProduct.mutate({ id: editingId, data });
    } else {
      createProduct.mutate({ data });
    }
  };

  const handleCategorySubmit = () => {
    if (!categoryForm.name.trim()) return;
    const data = { name: categoryForm.name.trim(), description: categoryForm.description.trim() || undefined };
    if (editingCategoryId !== null) {
      updateCategory.mutate({ id: editingCategoryId, data });
    } else {
      createCategory.mutate({ data });
    }
  };

  const isPending = createProduct.isPending || updateProduct.isPending;
  const isCatPending = createCategory.isPending || updateCategory.isPending;
  const isVariantPending = createVariant.isPending || updateVariant.isPending;
  const handleVariantSubmit = () => {
    if (!editingId || !variantForm.name.trim() || !variantForm.price) return;
    const data = { name: variantForm.name.trim(), price: parseFloat(variantForm.price), available: variantForm.available };
    if (editingVariantId) {
      updateVariant.mutate({ id: editingVariantId, data });
      return;
    }
    const sortOrder = variants?.length ?? 0;
    createVariant.mutate({ id: editingId, data: { ...data, sortOrder, active: true } });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cardápio</h1>
            <p className="text-muted-foreground mt-1">Produtos e categorias</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInactive(!showInactive)}
              title={showInactive ? "Ocultar inativos" : "Mostrar inativos"}
            >
              {showInactive ? <EyeOff className="w-4 h-4 mr-1.5" /> : <Eye className="w-4 h-4 mr-1.5" />}
              {showInactive ? "Ocultar inativos" : "Ver inativos"}
            </Button>
            <Button variant="outline" onClick={() => { setEditingCategoryId(null); setCategoryForm({ name: "", description: "" }); setCategoryDialog(true); }} data-testid="button-new-category">
              <Tag className="w-4 h-4 mr-2" /> Categorias
            </Button>
            <Button
              onClick={() => { setEditingId(null); setForm(emptyProduct); setProductDialog(true); }}
              data-testid="button-new-product"
            >
              <Plus className="w-4 h-4 mr-2" /> Produto
            </Button>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-product"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant={selectedCategory === "all" ? "default" : "outline"}
              onClick={() => setSelectedCategory("all")}
            >
              Todos
            </Button>
            {categories?.map((cat) => (
              <Button
                key={cat.id}
                size="sm"
                variant={selectedCategory === String(cat.id) ? "default" : "outline"}
                onClick={() => setSelectedCategory(String(cat.id))}
                data-testid={`filter-category-${cat.id}`}
              >
                {cat.name}
              </Button>
            ))}
          </div>
        </div>

        {loadingProducts ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : productsErrorMessage ? (
          <div className="text-center py-16 text-destructive">
            <p className="text-lg font-medium">Erro ao carregar produtos</p>
            <p className="text-sm mt-1">{productsErrorMessage}</p>
          </div>
        ) : products?.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">Nenhum produto encontrado</p>
            <p className="text-sm mt-1">
              {showInactive ? "Nenhum produto cadastrado ainda." : "Tente ativar 'Ver inativos' ou crie um novo produto."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products?.map((product) => (
              <Card
                key={product.id}
                className={`transition-all hover:shadow-md ${!product.active ? "opacity-50 border-dashed" : !product.available ? "opacity-70" : ""}`}
                data-testid={`card-product-${product.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className={`font-semibold truncate ${!product.active ? "line-through text-muted-foreground" : ""}`}>
                          {product.name}
                        </p>
                        {!product.active && (
                          <Badge variant="outline" className="text-xs border-red-400 text-red-600">Inativo</Badge>
                        )}
                        {product.active && !product.available && (
                          <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">Indisponível</Badge>
                        )}
                      </div>
                      {product.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`font-bold text-lg ${product.active ? "text-primary" : "text-muted-foreground"}`}>
                          R$ {product.price.toFixed(2)}
                        </span>
                        {product.categoryName && (
                          <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                            {product.categoryName}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {/* Toggle disponível/indisponível */}
                      {product.active && (
                        <Button
                          size="sm"
                          variant="outline"
                          title={product.available ? "Marcar indisponível" : "Marcar disponível"}
                          onClick={() => updateProduct.mutate({ id: product.id, data: { available: !product.available } })}
                          data-testid={`button-toggle-available-${product.id}`}
                        >
                          {product.available
                            ? <ToggleRight className="w-3.5 h-3.5 text-green-600" />
                            : <ToggleLeft className="w-3.5 h-3.5 text-amber-600" />}
                        </Button>
                      )}
                      {/* Reativar produto inativo */}
                      {!product.active && (
                        <Button
                          size="sm"
                          variant="outline"
                          title="Reativar produto"
                          onClick={() => updateProduct.mutate({ id: product.id, data: { active: true, available: true } })}
                          data-testid={`button-reactivate-${product.id}`}
                        >
                          <Eye className="w-3.5 h-3.5 text-green-600" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(product)}
                        data-testid={`button-edit-product-${product.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget({ id: product.id, name: product.name })}
                        data-testid={`button-delete-product-${product.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {fetchingProducts && !loadingProducts ? (
          <p className="text-xs text-muted-foreground text-right">Atualizando lista...</p>
        ) : null}
      </div>

      {/* Product Dialog */}
      <Dialog open={productDialog} onOpenChange={(o) => { setProductDialog(o); if (!o) { setEditingId(null); setForm(emptyProduct); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Produto" : "Novo Produto"}</DialogTitle>
            <DialogDescription>Preencha os dados do produto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 pt-2">
            <div className="space-y-4 rounded-lg border p-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Produto</h3>
              <div>
                <Label>Nome *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: X-Burger"
                  data-testid="input-product-name"
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Ingredientes, tamanho, etc."
                  rows={2}
                  data-testid="input-product-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Preço de venda (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="0,00"
                    data-testid="input-product-price"
                  />
                </div>
                <div>
                  <Label>Categoria *</Label>
                  <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                    <SelectTrigger data-testid="select-product-category">
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.available}
                    onCheckedChange={(v) => setForm({ ...form, available: v })}
                    id="available"
                    data-testid="switch-product-available"
                  />
                  <Label htmlFor="available">Disponível para venda</Label>
                  <p className="text-xs text-muted-foreground">Quando desligado, este produto não aparece para venda.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-lg border p-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Imagem do produto</h3>
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Upload de imagem será habilitado em uma próxima etapa.</div>
              <div><Label>URL da imagem (opcional avançado)</Label><Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." /></div>
              {form.imageUrl ? <img src={form.imageUrl} alt={form.imageAlt || form.name || "Prévia"} className="h-24 w-24 rounded object-cover border" /> : null}
              <div><Label>Texto alternativo</Label><Input value={form.imageAlt} onChange={(e) => setForm({ ...form, imageAlt: e.target.value })} /></div>
            </div>

            <div className="space-y-4 rounded-lg border p-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Comercial</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
                <div><Label>Código de barras</Label><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Custo (R$)</Label><Input type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} /></div>
                <div><Label>Unidade</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="unidade" /></div>
                <div><Label>Preparo (min)</Label><Input type="number" min="0" step="1" value={form.preparationTimeMinutes} onChange={(e) => setForm({ ...form, preparationTimeMinutes: e.target.value })} /></div>
              </div>
            </div>

            <div className="space-y-4 rounded-lg border p-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Estoque opcional</h3>
              <div className="flex items-center gap-3">
                <Switch checked={form.trackStock} onCheckedChange={(v) => setForm({ ...form, trackStock: v })} id="trackStock" />
                <Label htmlFor="trackStock">Controlar estoque</Label>
              </div>
              {form.trackStock && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Quantidade em estoque</Label><Input type="number" min="0" step="0.01" value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: e.target.value })} /></div>
                    <div><Label>Estoque mínimo</Label><Input type="number" min="0" step="0.01" value={form.stockMinQty} onChange={(e) => setForm({ ...form, stockMinQty: e.target.value })} /></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={form.allowSaleWithoutStock} onCheckedChange={(v) => setForm({ ...form, allowSaleWithoutStock: v })} id="allowSaleWithoutStock" />
                    <Label htmlFor="allowSaleWithoutStock">Permitir venda sem estoque</Label>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Variações do produto</h3>
              {editingId === null ? (
                <p className="text-sm text-muted-foreground">Salve o produto primeiro para adicionar variações.</p>
              ) : (
                <div className="space-y-3">
                  {loadingVariants ? (
                    <Skeleton className="h-16 w-full" />
                  ) : variants && variants.length > 0 ? (
                    <div className="space-y-2">
                      {variants.map((variant) => (
                        <div key={variant.id} className="flex items-center justify-between rounded border p-2">
                          <div>
                            <p className="text-sm font-medium">{variant.name}</p>
                            <p className="text-xs text-muted-foreground">R$ {variant.price.toFixed(2)} • {variant.available ? "Disponível" : "Indisponível"}</p>
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => { setEditingVariantId(variant.id); setVariantForm({ name: variant.name, price: String(variant.price), available: variant.available }); }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => deleteVariant.mutate({ id: variant.id })}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma variação cadastrada ainda.</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <Input placeholder="Nome da variação" value={variantForm.name} onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })} />
                    <Input type="number" step="0.01" min="0" placeholder="Preço" value={variantForm.price} onChange={(e) => setVariantForm({ ...variantForm, price: e.target.value })} />
                    <div className="flex items-center gap-2 rounded border px-2">
                      <Switch checked={variantForm.available} onCheckedChange={(v) => setVariantForm({ ...variantForm, available: v })} id="variant-available" />
                      <Label htmlFor="variant-available">Disponível para venda</Label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" onClick={handleVariantSubmit} disabled={isVariantPending || !variantForm.name.trim() || !variantForm.price}>
                      {editingVariantId ? "Salvar variação" : "Adicionar variação"}
                    </Button>
                    {editingVariantId && (
                      <Button type="button" variant="outline" onClick={() => { setEditingVariantId(null); setVariantForm({ name: "", price: "", available: true }); }}>
                        Cancelar edição
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {categories?.length === 0 && (
              <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                ⚠️ Crie uma categoria primeiro antes de adicionar produtos.
              </p>
            )}
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={isPending || !form.name.trim() || !form.price || !form.categoryId}
              data-testid="button-submit-product"
            >
              {isPending ? "Salvando..." : editingId ? "Salvar Alterações" : "Criar Produto"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={categoryDialog} onOpenChange={(o) => { setCategoryDialog(o); if (!o) { setEditingCategoryId(null); setCategoryForm({ name: "", description: "" }); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerenciar Categorias</DialogTitle>
            <DialogDescription>Crie e gerencie as categorias do cardápio.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>{editingCategoryId ? "Editar nome" : "Nova categoria"}</Label>
              <div className="flex gap-2">
                <Input
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  placeholder="Ex: Lanches, Bebidas..."
                  data-testid="input-category-name"
                  onKeyDown={(e) => e.key === "Enter" && handleCategorySubmit()}
                />
                <Button
                  onClick={handleCategorySubmit}
                  disabled={isCatPending || !categoryForm.name.trim()}
                  data-testid="button-submit-category"
                >
                  {editingCategoryId ? "Salvar" : <Plus className="w-4 h-4" />}
                </Button>
                {editingCategoryId && (
                  <Button variant="outline" onClick={() => { setEditingCategoryId(null); setCategoryForm({ name: "", description: "" }); }}>
                    Cancelar
                  </Button>
                )}
              </div>
            </div>

            {categories && categories.length > 0 && (
              <div>
                <Label className="mb-2 block text-muted-foreground text-xs uppercase tracking-wide">Categorias ({categories.length})</Label>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {categories.map((cat) => (
                    <div key={cat.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${editingCategoryId === cat.id ? "border-primary bg-primary/5" : "bg-muted/40"}`}>
                      <span className="text-sm font-medium">{cat.name}</span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => { setEditingCategoryId(cat.id); setCategoryForm({ name: cat.name, description: cat.description ?? "" }); }}
                          data-testid={`button-edit-category-${cat.id}`}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive h-7 w-7 p-0"
                          onClick={() => setDeleteCategoryTarget({ id: cat.id, name: cat.name })}
                          data-testid={`button-delete-category-${cat.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm delete product */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> será excluído permanentemente.
              <br />
              Se o produto já foi vendido, ele será apenas <strong>desativado</strong> para preservar o histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteProduct.mutate({ id: deleteTarget.id })}
              data-testid="button-confirm-delete-product"
            >
              {deleteProduct.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm delete category */}
      <AlertDialog open={!!deleteCategoryTarget} onOpenChange={(o) => { if (!o) setDeleteCategoryTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              A categoria <strong>{deleteCategoryTarget?.name}</strong> será removida.
              Não é possível remover categorias que possuem produtos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteCategoryTarget && deleteCategory.mutate({ id: deleteCategoryTarget.id })}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
