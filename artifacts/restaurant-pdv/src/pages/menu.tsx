import { useEffect, useMemo, useState } from "react";
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
  useListAddonGroups,
  getListAddonGroupsQueryKey,
  useCreateAddonGroup,
  useUpdateAddonGroup,
  useCreateAddonOption,
  useUpdateAddonOption,
  useListProductAddonGroups,
  getListProductAddonGroupsQueryKey,
  useUpdateProductAddonGroups,
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
  DialogFooter,
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
import { Plus, Search, Pencil, Trash2, Tag, Eye, EyeOff, ToggleLeft, ToggleRight, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImportMenuDialog } from "@/components/import-menu-dialog";

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
type VariantTemplate = { id: number; name: string; description: string | null; active: boolean };
type VariantTemplateOption = { id: number; templateId: number; name: string; price: number; available: boolean; sortOrder: number };
type AddonOption = { id: number; groupId: number; name: string; price: number; available: boolean; sortOrder: number };
type AddonGroup = { id: number; name: string; description?: string | null; required: boolean; minSelected: number; maxSelected?: number | null; active: boolean; options: AddonOption[] };
type MultisaborGroup = { id: number; name: string; description?: string | null; quantityStepLabel?: string | null; optionsStepLabel?: string | null; pricingMode?: string; active: boolean; available: boolean; sortOrder: number };
type MultisaborSize = { id: number; name: string; minFlavors: number; maxFlavors: number; active: boolean; available: boolean };
type MultisaborClassification = { id: number; name: string; rank: number; active: boolean; sortOrder: number };
type MultisaborPrice = { id: number; sizeId: number; classificationId: number; price: string };
type MultisaborFlavor = { id: number; productId: number; productName: string; classificationId: number; active: boolean; available: boolean };
type MultisaborAddonLink = { id: number; addonGroupId: number; addonGroupName: string; sortOrder: number };
type MultisaborConfig = { sizes: MultisaborSize[]; classifications: MultisaborClassification[]; prices: MultisaborPrice[]; flavors: MultisaborFlavor[]; addonGroups: MultisaborAddonLink[] };
type MultisaborImportPreview = { counters: { grupos: number; tamanhos: number; classificacoes: number; precos: number; sabores: number; adicionais: number; erros: number }; errors: { rowNumber: number; field: string; message: string }[]; rows: { rowNumber: number; tipo: string; grupo: string; resumo: string }[] };
type MenuResetPreview = { categories: number; products: number; variants: number; addonGroups: number; addonOptions: number; productAddonLinks: number; legacyPizzaConfigs: number; multiflavorGroups: number; multiflavorSizes: number; multiflavorClassifications: number; multiflavorPrices: number; multiflavorFlavors: number; multiflavorAddonLinks: number; orderItemsToDetach: number; orderItemAddonsToDetach: number };

type ApiErrorLike = {
  data?: { error?: unknown; message?: unknown } | null;
  response?: { data?: { error?: unknown } | null; status?: unknown } | null;
  message?: unknown;
  status?: unknown;
};

function getApiErrorMessage(err: unknown, fallback: string): string {
  const apiError = err as ApiErrorLike | null;
  const message = apiError?.data?.error ?? apiError?.data?.message ?? apiError?.response?.data?.error ?? apiError?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function getApiErrorStatus(err: unknown): number | null {
  const apiError = err as ApiErrorLike | null;
  const status = apiError?.status ?? apiError?.response?.status;
  return typeof status === "number" ? status : null;
}

function getAddonApiErrorMessage(err: unknown, fallback: string): string {
  const message = getApiErrorMessage(err, fallback);
  if (getApiErrorStatus(err) === 403 && message.toLowerCase().includes("permiss")) {
    return "Você precisa estar como Max Control para criar ou editar adicionais.";
  }
  return message;
}

export default function Menu() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [productDialog, setProductDialog] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [resetDialog, setResetDialog] = useState(false);
  const [resetPreview, setResetPreview] = useState<MenuResetPreview | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyProduct);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({ name: "", description: "" });
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<{ id: number; name: string } | null>(null);
  const [variantForm, setVariantForm] = useState<VariantForm>({ name: "", price: "", available: true });
  const [editingVariantId, setEditingVariantId] = useState<number | null>(null);
  const [variantTemplatesDialog, setVariantTemplatesDialog] = useState(false);
  const [templates, setTemplates] = useState<VariantTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateForm, setTemplateForm] = useState({ id: 0, name: "", description: "" });
  const [templateOptionForm, setTemplateOptionForm] = useState({ templateId: 0, name: "", price: "", available: true });
  const [editingTemplateOptionId, setEditingTemplateOptionId] = useState<number>(0);
  const [templateOptionsMap, setTemplateOptionsMap] = useState<Record<number, VariantTemplateOption[]>>({});
  const [addonDialog, setAddonDialog] = useState(false);
  const [productAddonGroupIds, setProductAddonGroupIds] = useState<number[]>([]);
  const [addonGroupForm, setAddonGroupForm] = useState({ name: "", description: "", required: false, minSelected: "0", maxSelected: "", active: true });
  const [editingAddonGroupId, setEditingAddonGroupId] = useState<number>(0);
  const [addonOptionForm, setAddonOptionForm] = useState({ groupId: 0, name: "", price: "", available: true });
  const [editingAddonOptionId, setEditingAddonOptionId] = useState<number>(0);
  const [showPizzaMultiflavorConfig, setShowPizzaMultiflavorConfig] = useState(false);
  const [multisaborGroups, setMultisaborGroups] = useState<MultisaborGroup[]>([]);
  const [selectedMultisaborGroupId, setSelectedMultisaborGroupId] = useState<number | null>(null);
  const [multisaborConfig, setMultisaborConfig] = useState<MultisaborConfig>({ sizes: [], classifications: [], prices: [], flavors: [], addonGroups: [] });
  const [multisaborGroupForm, setMultisaborGroupForm] = useState({ id: 0, name: "", description: "", active: true, available: true });
  const [multisaborSizeForm, setMultisaborSizeForm] = useState({ name: "", minFlavors: "1", maxFlavors: "2" });
  const [multisaborClassificationForm, setMultisaborClassificationForm] = useState({ name: "", rank: "0" });
  const [multisaborPriceForm, setMultisaborPriceForm] = useState({ sizeId: "", classificationId: "", price: "" });
  const [multisaborFlavorForm, setMultisaborFlavorForm] = useState({ productId: "", classificationId: "" });
  const [multisaborAddonGroupId, setMultisaborAddonGroupId] = useState("");
  const [multisaborCsv, setMultisaborCsv] = useState("");
  const [multisaborImportPreview, setMultisaborImportPreview] = useState<MultisaborImportPreview | null>(null);
  const [multisaborImporting, setMultisaborImporting] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const hidePizzaMultiflavorConfig = () => setShowPizzaMultiflavorConfig(false);

  const openPizzaMultiflavorConfig = () => {
    setShowPizzaMultiflavorConfig(true);
    void loadMultisaborGroups();
    window.requestAnimationFrame(() => {
      document.getElementById("multisabor-config")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const loadMultisaborGroups = async () => {
    const res = await fetch("/api/menu/multisabor/groups");
    if (!res.ok) { toast({ title: await getErrorMessage(res, "Não foi possível carregar grupos Multisabor."), variant: "destructive" }); return; }
    const rows = await res.json() as MultisaborGroup[];
    setMultisaborGroups(rows);
    if (!selectedMultisaborGroupId && rows[0]) setSelectedMultisaborGroupId(rows[0].id);
  };

  const loadMultisaborConfig = async (groupId: number) => {
    const res = await fetch(`/api/menu/multisabor/groups/${groupId}/config`);
    if (!res.ok) { toast({ title: await getErrorMessage(res, "Não foi possível carregar a configuração Multisabor desta loja."), variant: "destructive" }); return; }
    setMultisaborConfig(await res.json() as MultisaborConfig);
  };


  useEffect(() => { if (showPizzaMultiflavorConfig) void loadMultisaborGroups(); }, [showPizzaMultiflavorConfig]);
  useEffect(() => { if (selectedMultisaborGroupId) void loadMultisaborConfig(selectedMultisaborGroupId); }, [selectedMultisaborGroupId]);
  const selectedMultisaborGroup = multisaborGroups.find((g) => g.id === selectedMultisaborGroupId) ?? null;
  const saveMultisaborGroup = async () => {
    if (!multisaborGroupForm.name.trim()) return;
    const isEdit = multisaborGroupForm.id > 0;
    const res = await fetch(isEdit ? `/api/menu/multisabor/groups/${multisaborGroupForm.id}` : "/api/menu/multisabor/groups", { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: multisaborGroupForm.name.trim(), description: multisaborGroupForm.description.trim() || null, quantityStepLabel: "Quantidade de sabores", optionsStepLabel: "Sabores", pricingMode: "highest_classification", active: multisaborGroupForm.active, available: multisaborGroupForm.available }) });
    if (!res.ok) { toast({ title: await getErrorMessage(res, "Erro ao salvar grupo Multisabor desta loja."), variant: "destructive" }); return; }
    setMultisaborGroupForm({ id: 0, name: "", description: "", active: true, available: true });
    await loadMultisaborGroups();
    toast({ title: isEdit ? "Grupo Multisabor atualizado." : "Grupo Multisabor criado." });
  };
  const inactivateMultisaborGroup = async (id: number) => { const res = await fetch(`/api/menu/multisabor/groups/${id}`, { method: "DELETE" }); if (!res.ok) { toast({ title: await getErrorMessage(res, "Erro ao inativar grupo Multisabor."), variant: "destructive" }); return; } await loadMultisaborGroups(); toast({ title: "Grupo Multisabor inativado." }); };
  const saveMultisaborSize = async () => { if (!selectedMultisaborGroupId) return; const res = await fetch(`/api/menu/multisabor/groups/${selectedMultisaborGroupId}/sizes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: multisaborSizeForm.name, minFlavors: Number(multisaborSizeForm.minFlavors), maxFlavors: Number(multisaborSizeForm.maxFlavors) }) }); if (!res.ok) { toast({ title: await getErrorMessage(res, "Tamanho inválido para este grupo/loja."), variant: "destructive" }); return; } setMultisaborSizeForm({ name: "", minFlavors: "1", maxFlavors: "2" }); await loadMultisaborConfig(selectedMultisaborGroupId); };
  const saveMultisaborClassification = async () => { if (!selectedMultisaborGroupId) return; const res = await fetch(`/api/menu/multisabor/groups/${selectedMultisaborGroupId}/classifications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: multisaborClassificationForm.name, rank: Number(multisaborClassificationForm.rank) }) }); if (!res.ok) { toast({ title: await getErrorMessage(res, "Classificação inválida para este grupo/loja."), variant: "destructive" }); return; } setMultisaborClassificationForm({ name: "", rank: "0" }); await loadMultisaborConfig(selectedMultisaborGroupId); };
  const saveMultisaborPrice = async () => { if (!selectedMultisaborGroupId) return; const res = await fetch(`/api/menu/multisabor/groups/${selectedMultisaborGroupId}/prices`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prices: [{ sizeId: Number(multisaborPriceForm.sizeId), classificationId: Number(multisaborPriceForm.classificationId), price: Number(multisaborPriceForm.price) }] }) }); if (!res.ok) { toast({ title: await getErrorMessage(res, "Preço, tamanho ou classificação inválida para este grupo/loja."), variant: "destructive" }); return; } setMultisaborPriceForm({ sizeId: "", classificationId: "", price: "" }); await loadMultisaborConfig(selectedMultisaborGroupId); };
  const saveMultisaborFlavor = async () => { if (!selectedMultisaborGroupId) return; const res = await fetch(`/api/menu/multisabor/groups/${selectedMultisaborGroupId}/flavors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: Number(multisaborFlavorForm.productId), classificationId: Number(multisaborFlavorForm.classificationId) }) }); if (!res.ok) { toast({ title: await getErrorMessage(res, "Produto ou classificação não pertence à loja atual."), variant: "destructive" }); return; } setMultisaborFlavorForm({ productId: "", classificationId: "" }); await loadMultisaborConfig(selectedMultisaborGroupId); };
  const saveMultisaborAddon = async () => { if (!selectedMultisaborGroupId) return; const res = await fetch(`/api/menu/multisabor/groups/${selectedMultisaborGroupId}/addon-groups`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addonGroupId: Number(multisaborAddonGroupId) }) }); if (!res.ok) { toast({ title: await getErrorMessage(res, "Grupo de adicionais não pertence à loja atual."), variant: "destructive" }); return; } setMultisaborAddonGroupId(""); await loadMultisaborConfig(selectedMultisaborGroupId); };
  const removeMultisaborAddon = async (linkId: number) => { if (!selectedMultisaborGroupId) return; const res = await fetch(`/api/menu/multisabor/groups/${selectedMultisaborGroupId}/addon-groups/${linkId}`, { method: "DELETE" }); if (!res.ok) { toast({ title: await getErrorMessage(res, "Erro ao remover vínculo de adicionais."), variant: "destructive" }); return; } await loadMultisaborConfig(selectedMultisaborGroupId); };

  const downloadMultisaborTemplate = () => { window.location.href = "/api/menu/multisabor/import-template"; };
  const validateMultisaborCsv = async () => {
    setMultisaborImporting(true);
    const res = await fetch("/api/menu/multisabor/import/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: multisaborCsv }) });
    setMultisaborImporting(false);
    if (!res.ok) { toast({ title: await getErrorMessage(res, "Não foi possível validar o CSV Multisabor."), variant: "destructive" }); return; }
    const preview = await res.json() as MultisaborImportPreview;
    setMultisaborImportPreview(preview);
    toast({ title: preview.counters.erros ? `Validação encontrou ${preview.counters.erros} erro(s).` : "CSV validado sem erros." });
  };
  const confirmMultisaborImport = async () => {
    setMultisaborImporting(true);
    const res = await fetch("/api/menu/multisabor/import/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: multisaborCsv }) });
    setMultisaborImporting(false);
    if (!res.ok) { const body = await res.json().catch(() => null) as MultisaborImportPreview & { error?: string } | null; if (body?.errors) setMultisaborImportPreview({ counters: body.counters, errors: body.errors, rows: [] }); toast({ title: body?.error ?? "Corrija os erros antes de importar.", variant: "destructive" }); return; }
    toast({ title: "Configuração Multisabor importada." });
    setMultisaborImportPreview(null);
    setMultisaborCsv("");
    await loadMultisaborGroups();
    if (selectedMultisaborGroupId) await loadMultisaborConfig(selectedMultisaborGroupId);
  };
  const loadMultisaborCsvFile = async (file: File | null) => { if (file) setMultisaborCsv(await file.text()); };


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

  const { data: addonGroupsData, error: addonGroupsError, isFetching: fetchingAddonGroups } = useListAddonGroups({
    query: { queryKey: getListAddonGroupsQueryKey() },
  });
  const addonGroups = Array.isArray(addonGroupsData) ? addonGroupsData : [];
  const addonGroupsLoadFailed = Boolean(addonGroupsError) || (addonGroupsData !== undefined && !Array.isArray(addonGroupsData));

  const { data: linkedAddonGroupsData, error: linkedAddonGroupsError } = useListProductAddonGroups(editingId ?? 0, {
    query: { enabled: editingId !== null, queryKey: getListProductAddonGroupsQueryKey(editingId ?? 0) },
  });



  const openResetDialog = async () => {
    hidePizzaMultiflavorConfig();
    setResetDialog(true);
    setResetPreview(null);
    setResetConfirmation("");
    setResetLoading(true);
    try {
      const res = await fetch("/api/menu/reset-preview");
      if (!res.ok) throw new Error(await getErrorMessage(res, "Não foi possível carregar a prévia da limpeza."));
      setResetPreview(await res.json() as MenuResetPreview);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Não foi possível carregar a prévia da limpeza.", variant: "destructive" });
    } finally {
      setResetLoading(false);
    }
  };

  const confirmMenuReset = async () => {
    if (resetConfirmation !== "LIMPAR CARDAPIO") return;
    setResetLoading(true);
    try {
      const res = await fetch("/api/menu/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: resetConfirmation }),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, "Não foi possível limpar o cardápio da loja."));
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(params) });
      queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListAddonGroupsQueryKey() });
      if (editingId !== null) {
        queryClient.invalidateQueries({ queryKey: getListProductVariantsQueryKey(editingId) });
        queryClient.invalidateQueries({ queryKey: getListProductAddonGroupsQueryKey(editingId) });
      }
      setMultisaborGroups([]);
      setMultisaborConfig({ sizes: [], classifications: [], prices: [], flavors: [], addonGroups: [] });
      setSelectedMultisaborGroupId(null);
      if (showPizzaMultiflavorConfig) void loadMultisaborGroups();
      setResetDialog(false);
      toast({ title: "Cardápio da loja limpo com sucesso." });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Não foi possível limpar o cardápio da loja.", variant: "destructive" });
    } finally {
      setResetLoading(false);
    }
  };

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

  const createAddonGroupMutation = useCreateAddonGroup({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAddonGroupsQueryKey() });
        setAddonGroupForm({ name: "", description: "", required: false, minSelected: "0", maxSelected: "", active: true });
        setEditingAddonGroupId(0);
        toast({ title: "Grupo de adicionais salvo." });
      },
      onError: (err) => {
        const msg = getAddonApiErrorMessage(err, "Erro ao salvar grupo de adicionais.");
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const updateAddonGroupMutation = useUpdateAddonGroup({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAddonGroupsQueryKey() });
        toast({ title: "Grupo de adicionais atualizado." });
      },
      onError: (err) => {
        const msg = getAddonApiErrorMessage(err, "Erro ao atualizar grupo de adicionais.");
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const createAddonOptionMutation = useCreateAddonOption({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAddonGroupsQueryKey() });
        setAddonOptionForm((current) => ({ groupId: current.groupId, name: "", price: "", available: true }));
        setEditingAddonOptionId(0);
        toast({ title: "Opção de adicional salva." });
      },
      onError: (err) => {
        const msg = getAddonApiErrorMessage(err, "Erro ao salvar opção de adicional.");
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const updateAddonOptionMutation = useUpdateAddonOption({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAddonGroupsQueryKey() });
        setEditingAddonOptionId(0);
        toast({ title: "Opção de adicional atualizada." });
      },
      onError: (err) => {
        const msg = getAddonApiErrorMessage(err, "Erro ao atualizar opção de adicional.");
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const updateProductAddonGroupsMutation = useUpdateProductAddonGroups({
    mutation: {
      onSuccess: (_data, variables) => {
        const nextIds = Array.isArray(variables.data.addonGroupIds) ? variables.data.addonGroupIds : [];
        setProductAddonGroupIds(nextIds);
        if (editingId !== null) {
          queryClient.invalidateQueries({ queryKey: getListProductAddonGroupsQueryKey(editingId) });
        }
        toast({ title: "Adicionais vinculados ao produto." });
      },
      onError: (err) => {
        const msg = getAddonApiErrorMessage(err, "Erro ao vincular adicionais ao produto.");
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  useEffect(() => {
    if (addonGroupsError || (addonGroupsData !== undefined && !Array.isArray(addonGroupsData))) {
      const msg = addonGroupsError
        ? getAddonApiErrorMessage(addonGroupsError, "Não foi possível carregar adicionais. Tente atualizar a página.")
        : "Não foi possível carregar adicionais. Tente atualizar a página.";
      toast({ title: msg, variant: "destructive" });
    }
  }, [addonGroupsData, addonGroupsError, toast]);

  useEffect(() => {
    if (editingId === null) {
      setProductAddonGroupIds([]);
      return;
    }
    if (Array.isArray(linkedAddonGroupsData)) {
      setProductAddonGroupIds(linkedAddonGroupsData.map((group) => group.id));
      return;
    }
    if (linkedAddonGroupsData !== undefined || linkedAddonGroupsError) {
      setProductAddonGroupIds([]);
      const msg = linkedAddonGroupsError
        ? getAddonApiErrorMessage(linkedAddonGroupsError, "Não foi possível carregar os adicionais vinculados a este produto.")
        : "Não foi possível carregar os adicionais vinculados a este produto.";
      toast({ title: msg, variant: "destructive" });
    }
  }, [editingId, linkedAddonGroupsData, linkedAddonGroupsError, toast]);

  const submitAddonGroup = () => {
    const name = addonGroupForm.name.trim();
    if (!name) {
      toast({ title: "Informe o nome do grupo de adicionais.", variant: "destructive" });
      return;
    }
    const minSelected = Number(addonGroupForm.minSelected);
    if (!addonGroupForm.minSelected.trim() || !Number.isInteger(minSelected) || minSelected < 0) {
      toast({ title: "Mínimo precisa ser um inteiro maior ou igual a 0.", variant: "destructive" });
      return;
    }
    const hasMaxSelected = addonGroupForm.maxSelected.trim() !== "";
    const parsedMaxSelected = Number(addonGroupForm.maxSelected);
    if (hasMaxSelected && (!Number.isInteger(parsedMaxSelected) || parsedMaxSelected < 0)) {
      toast({ title: "Máximo precisa ser um inteiro maior ou igual a 0.", variant: "destructive" });
      return;
    }
    const maxSelected = hasMaxSelected ? parsedMaxSelected : null;
    if (maxSelected !== null && minSelected > maxSelected) {
      toast({ title: "Mínimo não pode ser maior que o máximo.", variant: "destructive" });
      return;
    }
    const data = {
      name,
      description: addonGroupForm.description.trim() || null,
      required: addonGroupForm.required,
      minSelected,
      maxSelected,
      active: addonGroupForm.active,
    };
    if (editingAddonGroupId) {
      updateAddonGroupMutation.mutate({ id: editingAddonGroupId, data });
      setAddonGroupForm({ name: "", description: "", required: false, minSelected: "0", maxSelected: "", active: true });
      setEditingAddonGroupId(0);
      return;
    }
    createAddonGroupMutation.mutate({ data });
  };

  const editAddonGroup = (group: AddonGroup) => {
    setEditingAddonGroupId(group.id);
    setAddonGroupForm({
      name: group.name,
      description: group.description ?? "",
      required: group.required,
      minSelected: String(group.minSelected ?? 0),
      maxSelected: group.maxSelected != null ? String(group.maxSelected) : "",
      active: group.active,
    });
  };

  const toggleAddonGroup = (group: AddonGroup) => {
    updateAddonGroupMutation.mutate({ id: group.id, data: { active: !group.active } });
  };

  const submitAddonOption = () => {
    if (!addonOptionForm.groupId || !addonOptionForm.name.trim()) return;
    const data = { name: addonOptionForm.name.trim(), price: Number(addonOptionForm.price || 0), available: addonOptionForm.available };
    if (editingAddonOptionId) {
      updateAddonOptionMutation.mutate({ id: editingAddonOptionId, data });
      setAddonOptionForm({ groupId: addonOptionForm.groupId, name: "", price: "", available: true });
      setEditingAddonOptionId(0);
      return;
    }
    createAddonOptionMutation.mutate({ id: addonOptionForm.groupId, data });
  };

  const editAddonOption = (option: AddonOption) => {
    setEditingAddonOptionId(option.id);
    setAddonOptionForm({ groupId: option.groupId, name: option.name, price: String(option.price), available: option.available });
  };

  const toggleAddonOption = (option: AddonOption) => {
    updateAddonOptionMutation.mutate({ id: option.id, data: { available: !option.available } });
  };

  const saveProductAddonGroups = (nextIds = productAddonGroupIds) => {
    if (editingId === null) return;
    updateProductAddonGroupsMutation.mutate({ id: editingId, data: { addonGroupIds: nextIds } });
  };

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

  const getErrorMessage = async (res: Response, fallback: string) => {
    try {
      const body = await res.json() as { error?: string };
      return body.error || fallback;
    } catch {
      return fallback;
    }
  };
  const loadTemplates = async () => {
    const res = await fetch("/api/menu/variant-templates");
    if (!res.ok) return;
    const data = await res.json() as VariantTemplate[];
    setTemplates(data);
    await Promise.all(data.map(async (t) => {
      const opRes = await fetch(`/api/menu/variant-templates/${t.id}/options`);
      if (!opRes.ok) return;
      const ops = await opRes.json() as VariantTemplateOption[];
      setTemplateOptionsMap((prev) => ({ ...prev, [t.id]: ops }));
    }));
  };
  useEffect(() => { if (variantTemplatesDialog) loadTemplates(); }, [variantTemplatesDialog]);
  const saveTemplate = async () => {
    if (!templateForm.name.trim()) return;
    const isEdit = templateForm.id > 0;
    const url = isEdit ? `/api/menu/variant-templates/${templateForm.id}` : "/api/menu/variant-templates";
    const method = isEdit ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: templateForm.name, description: templateForm.description || null }) });
    if (res.ok) {
      toast({ title: isEdit ? "Modelo atualizado com sucesso." : "Modelo criado com sucesso." });
      setTemplateForm({ id: 0, name: "", description: "" });
      await loadTemplates();
      return;
    }
    toast({ title: await getErrorMessage(res, isEdit ? "Erro ao salvar modelo." : "Erro ao criar modelo."), variant: "destructive" });
  };
  const saveTemplateOption = async () => {
    if (!templateOptionForm.templateId || !templateOptionForm.name.trim() || !templateOptionForm.price) return;
    const isEdit = editingTemplateOptionId > 0;
    const url = isEdit ? `/api/menu/variant-template-options/${editingTemplateOptionId}` : `/api/menu/variant-templates/${templateOptionForm.templateId}/options`;
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: templateOptionForm.name, price: parseFloat(templateOptionForm.price), available: templateOptionForm.available }),
    });
    if (res.ok) {
      toast({ title: isEdit ? "Opção atualizada com sucesso." : "Opção adicionada com sucesso." });
      setEditingTemplateOptionId(0);
      setTemplateOptionForm({ ...templateOptionForm, name: "", price: "", available: true });
      await loadTemplates();
      return;
    }
    toast({ title: await getErrorMessage(res, isEdit ? "Erro ao atualizar opção." : "Erro ao adicionar opção."), variant: "destructive" });
  };
  const removeTemplateOption = async (id: number) => {
    const res = await fetch(`/api/menu/variant-template-options/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Opção removida com sucesso." });
      await loadTemplates();
      return;
    }
    toast({ title: await getErrorMessage(res, "Erro ao remover opção."), variant: "destructive" });
  };
  const removeTemplate = async (id: number) => {
    const res = await fetch(`/api/menu/variant-templates/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Modelo removido com sucesso." });
      await loadTemplates();
      return;
    }
    toast({ title: await getErrorMessage(res, "Erro ao remover modelo."), variant: "destructive" });
  };
  const applyTemplateToProduct = async () => {
    if (!editingId || !selectedTemplateId) return;
    const res = await fetch(`/api/menu/products/${editingId}/apply-variant-template`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: Number(selectedTemplateId) }),
    });
    if (!res.ok) {
      toast({ title: await getErrorMessage(res, "Erro ao aplicar modelo."), variant: "destructive" });
      return;
    }
    invalidateVariants();
    toast({ title: "Modelo aplicado com sucesso! As variações foram copiadas para o produto." });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cardápio</h1>
            <p className="text-muted-foreground mt-1">Produtos e categorias</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInactive(!showInactive)}
              title={showInactive ? "Ocultar inativos" : "Mostrar inativos"}
            >
              {showInactive ? <EyeOff className="w-4 h-4 mr-1.5" /> : <Eye className="w-4 h-4 mr-1.5" />}
              {showInactive ? "Ocultar inativos" : "Ver inativos"}
            </Button>
            <Button variant="outline" onClick={() => { hidePizzaMultiflavorConfig(); setEditingCategoryId(null); setCategoryForm({ name: "", description: "" }); setCategoryDialog(true); }} data-testid="button-new-category">
              <Tag className="w-4 h-4 mr-2" /> Categorias
            </Button>
            <Button variant="outline" onClick={() => { hidePizzaMultiflavorConfig(); setImportDialog(true); }} data-testid="button-import-menu">
              <Upload className="w-4 h-4 mr-2" /> Importar planilha
            </Button>
            <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={openResetDialog} data-testid="button-reset-menu">
              Limpar cardápio da loja
            </Button>
            <Button variant="outline" onClick={() => { hidePizzaMultiflavorConfig(); setVariantTemplatesDialog(true); }}>
              Variações gerais
            </Button>
            <Button variant="outline" onClick={() => { hidePizzaMultiflavorConfig(); setAddonDialog(true); }} data-testid="button-manage-addons">
              <Plus className="w-4 h-4 mr-2" /> Adicionais
            </Button>
            <Button variant="outline" onClick={openPizzaMultiflavorConfig} data-testid="button-pizza-multiflavor-tab">
              Multisabor
            </Button>
            <Button
              onClick={() => { hidePizzaMultiflavorConfig(); setEditingId(null); setForm(emptyProduct); setProductDialog(true); }}
              data-testid="button-new-product"
            >
              <Plus className="w-4 h-4 mr-2" /> Produto
            </Button>
          </div>
        </div>


        {showPizzaMultiflavorConfig && <Card id="multisabor-config" data-testid="multisabor-config">
          <CardContent className="p-5 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-3xl space-y-1">
                <h2 className="font-semibold text-xl">Multisabor</h2>
                <p className="text-sm text-muted-foreground">
                  Configure produtos que podem ter mais de uma escolha, como pizza meio a meio, açaí montável, combos ou marmitas personalizadas.
                </p>
                <p className="text-xs text-muted-foreground">Padrões: Quantidade de sabores • Sabores • Maior classificação selecionada</p>
              </div>
              <Button variant="outline" size="sm" onClick={hidePizzaMultiflavorConfig}>Voltar para produtos</Button>
            </div>


            <section className="rounded-xl border bg-muted/30 p-4 space-y-3" aria-labelledby="multisabor-import">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h3 id="multisabor-import" className="font-bold">Importar CSV Multisabor</h3><p className="text-sm text-muted-foreground">Valide primeiro, confira a prévia e só então confirme a gravação em lote.</p></div>
                <Button variant="outline" size="sm" onClick={downloadMultisaborTemplate}>Baixar modelo CSV Multisabor</Button>
              </div>
              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <Textarea rows={6} placeholder="Cole aqui o CSV Multisabor separado por ponto e vírgula" value={multisaborCsv} onChange={(e)=>{ setMultisaborCsv(e.target.value); setMultisaborImportPreview(null); }} />
                <div className="flex flex-col gap-2"><Input type="file" accept=".csv,text/csv" onChange={(e)=>void loadMultisaborCsvFile(e.target.files?.[0] ?? null)} /><Button disabled={!multisaborCsv.trim() || multisaborImporting} onClick={validateMultisaborCsv}>Validar planilha</Button><Button disabled={!multisaborImportPreview || multisaborImportPreview.counters.erros > 0 || multisaborImporting} onClick={confirmMultisaborImport}>Confirmar importação</Button></div>
              </div>
              {multisaborImportPreview ? <div className="space-y-3 rounded-lg border bg-background p-3">
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">{Object.entries(multisaborImportPreview.counters).map(([k,v])=><div key={k} className="rounded border p-2"><p className="text-xs text-muted-foreground">{k}</p><p className="font-semibold">{v}</p></div>)}</div>
                {multisaborImportPreview.errors.length ? <div className="space-y-1 text-sm text-destructive">{multisaborImportPreview.errors.map((e,idx)=><p key={idx}>Linha {e.rowNumber}: {e.message}</p>)}</div> : <div className="max-h-48 overflow-auto text-sm">{multisaborImportPreview.rows.slice(0, 30).map((r)=><p key={`${r.rowNumber}-${r.tipo}`}>Linha {r.rowNumber}: {r.tipo} — {r.grupo} — {r.resumo}</p>)}</div>}
              </div> : null}
            </section>

            <section className="rounded-xl border bg-muted/30 p-4" aria-labelledby="multisabor-recommended-order">
              <h3 id="multisabor-recommended-order" className="font-bold">Ordem recomendada</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {["Criar grupo", "Cadastrar tamanhos", "Cadastrar classificações", "Informar preços", "Vincular sabores", "Vincular adicionais"].map((step, index) => (
                  <div key={step} className="rounded-lg border bg-background p-3 text-sm">
                    <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
                    <p className="font-medium leading-snug">{step}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
              <section className="rounded-xl border p-4 space-y-3" data-testid="multisabor-section-groups">
                <div>
                  <h3 className="font-bold">Grupos Multisabor</h3>
                  <p className="text-sm text-muted-foreground">Comece criando o tipo de montagem que o cliente fará.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Nome do grupo</Label>
                  <Input placeholder="Ex: Pizza Multisabor, Açaí Montável, Combo Personalizado" value={multisaborGroupForm.name} onChange={(e)=>setMultisaborGroupForm({...multisaborGroupForm,name:e.target.value})}/>
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição opcional</Label>
                  <Textarea placeholder="Ex: Permite montar pizzas com até 2, 3 ou 4 sabores" value={multisaborGroupForm.description} onChange={(e)=>setMultisaborGroupForm({...multisaborGroupForm,description:e.target.value})} rows={2}/>
                </div>
                <div className="flex flex-wrap gap-2 text-sm"><label className="flex items-center gap-2 rounded border px-2 py-1"><Switch checked={multisaborGroupForm.active} onCheckedChange={(active)=>setMultisaborGroupForm({...multisaborGroupForm,active})}/> Ativo</label><label className="flex items-center gap-2 rounded border px-2 py-1"><Switch checked={multisaborGroupForm.available} onCheckedChange={(available)=>setMultisaborGroupForm({...multisaborGroupForm,available})}/> Disponível</label></div>
                <div className="flex gap-2"><Button size="sm" onClick={saveMultisaborGroup}>{multisaborGroupForm.id ? "Salvar grupo" : "Criar grupo"}</Button>{multisaborGroupForm.id ? <Button size="sm" variant="outline" onClick={()=>setMultisaborGroupForm({ id: 0, name: "", description: "", active: true, available: true })}>Cancelar</Button> : null}</div>
                <div className="space-y-2">{multisaborGroups.length ? multisaborGroups.map((g)=><div key={g.id} className={`rounded border p-3 ${selectedMultisaborGroupId===g.id ? "border-primary bg-primary/5" : ""}`}><button type="button" className="w-full text-left" onClick={()=>setSelectedMultisaborGroupId(g.id)}><p className="font-medium">{g.name}</p><p className="text-xs text-muted-foreground">{g.description || "Sem descrição"}</p><p className="text-xs text-muted-foreground">{g.active ? "Ativo" : "Inativo"} • {g.available ? "Disponível" : "Indisponível"}</p></button><div className="mt-2 flex gap-1"><Button size="sm" variant="outline" onClick={()=>setMultisaborGroupForm({ id: g.id, name: g.name, description: g.description ?? "", active: g.active, available: g.available })}>Editar</Button><Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={()=>inactivateMultisaborGroup(g.id)}>Inativar</Button></div></div>) : <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">Crie um grupo para começar. Exemplo: Pizza Multisabor.</p>}</div>
              </section>
              <section className="rounded-xl border p-4 space-y-4" data-testid="multisabor-section-selected-config">
                <div><h3 className="font-bold">Configuração do grupo selecionado</h3><p className="text-sm text-muted-foreground">{selectedMultisaborGroup ? selectedMultisaborGroup.name : "Crie um grupo para começar. Exemplo: Pizza Multisabor."}</p></div>
                {selectedMultisaborGroup ? <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-lg border p-3 space-y-3"><div><h4 className="font-semibold">Tamanhos</h4><p className="text-xs text-muted-foreground">Ex: Broto 1 a 1, Grande 1 a 2, Família 1 a 3</p></div><div className="grid gap-2 sm:grid-cols-3"><div className="space-y-1.5"><Label>Nome do tamanho</Label><Input placeholder="Ex: Grande" value={multisaborSizeForm.name} onChange={(e)=>setMultisaborSizeForm({...multisaborSizeForm,name:e.target.value})}/></div><div className="space-y-1.5"><Label>Mínimo de sabores</Label><Input type="number" min="1" placeholder="Ex: 1" value={multisaborSizeForm.minFlavors} onChange={(e)=>setMultisaborSizeForm({...multisaborSizeForm,minFlavors:e.target.value})}/></div><div className="space-y-1.5"><Label>Máximo de sabores</Label><Input type="number" min="1" placeholder="Ex: 2" value={multisaborSizeForm.maxFlavors} onChange={(e)=>setMultisaborSizeForm({...multisaborSizeForm,maxFlavors:e.target.value})}/></div></div><Button size="sm" onClick={saveMultisaborSize}>Adicionar tamanho</Button><div className="space-y-2">{multisaborConfig.sizes.length ? multisaborConfig.sizes.map((x)=><p key={x.id} className="rounded border px-2 py-1 text-sm"><strong>{x.name}</strong> — permite de {x.minFlavors} até {x.maxFlavors} sabores</p>) : <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">Cadastre pelo menos um tamanho antes de informar preços.</p>}</div></div>
                  <div className="rounded-lg border p-3 space-y-3"><div><h4 className="font-semibold">Classificações</h4><p className="text-xs text-muted-foreground">Use para separar sabores por faixa de preço. Ex: Tradicional, Especial, Premium. A maior prioridade vence no cálculo.</p></div><div className="grid gap-2 sm:grid-cols-2"><div className="space-y-1.5"><Label>Nome da classificação</Label><Input placeholder="Ex: Tradicional" value={multisaborClassificationForm.name} onChange={(e)=>setMultisaborClassificationForm({...multisaborClassificationForm,name:e.target.value})}/></div><div className="space-y-1.5"><Label>Prioridade de preço</Label><Input type="number" placeholder="Ex: 1" value={multisaborClassificationForm.rank} onChange={(e)=>setMultisaborClassificationForm({...multisaborClassificationForm,rank:e.target.value})}/></div></div><Button size="sm" onClick={saveMultisaborClassification}>Adicionar classificação</Button><div className="space-y-2">{multisaborConfig.classifications.length ? multisaborConfig.classifications.map((x)=><p key={x.id} className="rounded border px-2 py-1 text-sm"><strong>{x.name}</strong> — prioridade {x.rank}</p>) : <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">Cadastre pelo menos uma classificação antes de informar preços e sabores.</p>}</div></div>
                  <div className="rounded-lg border p-3 space-y-3"><div><h4 className="font-semibold">Preços por tamanho e classificação</h4><p className="text-xs text-muted-foreground">Informe quanto custa cada tamanho em cada faixa de preço.</p></div><Select value={multisaborPriceForm.sizeId} onValueChange={(v)=>setMultisaborPriceForm({...multisaborPriceForm,sizeId:v})}><SelectTrigger><SelectValue placeholder="Tamanho" /></SelectTrigger><SelectContent>{multisaborConfig.sizes.map((x)=><SelectItem key={x.id} value={String(x.id)}>{x.name}</SelectItem>)}</SelectContent></Select><Select value={multisaborPriceForm.classificationId} onValueChange={(v)=>setMultisaborPriceForm({...multisaborPriceForm,classificationId:v})}><SelectTrigger><SelectValue placeholder="Classificação" /></SelectTrigger><SelectContent>{multisaborConfig.classifications.map((x)=><SelectItem key={x.id} value={String(x.id)}>{x.name}</SelectItem>)}</SelectContent></Select><Input type="number" min="0" step="0.01" placeholder="Ex: 64,90" value={multisaborPriceForm.price} onChange={(e)=>setMultisaborPriceForm({...multisaborPriceForm,price:e.target.value})}/><Button size="sm" onClick={saveMultisaborPrice}>Salvar preço</Button><div className="space-y-2">{multisaborConfig.prices.length ? multisaborConfig.prices.map((x)=><p key={x.id} className="rounded border px-2 py-1 text-sm"><strong>{multisaborConfig.sizes.find(s=>s.id===x.sizeId)?.name}</strong> + {multisaborConfig.classifications.find(c=>c.id===x.classificationId)?.name} = R$ {Number(x.price).toFixed(2)}</p>) : <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">Depois de criar tamanhos e classificações, informe os preços.</p>}</div></div>
                  <div className="rounded-lg border p-3 space-y-3"><div><h4 className="font-semibold">Sabores</h4><p className="text-xs text-muted-foreground">Escolha produtos já cadastrados no cardápio para virarem sabores no Multisabor.</p></div><Select value={multisaborFlavorForm.productId} onValueChange={(v)=>setMultisaborFlavorForm({...multisaborFlavorForm,productId:v})}><SelectTrigger><SelectValue placeholder="Produto que será usado como sabor" /></SelectTrigger><SelectContent>{products?.map((x)=><SelectItem key={x.id} value={String(x.id)}>{x.name}</SelectItem>)}</SelectContent></Select><Select value={multisaborFlavorForm.classificationId} onValueChange={(v)=>setMultisaborFlavorForm({...multisaborFlavorForm,classificationId:v})}><SelectTrigger><SelectValue placeholder="Faixa de preço desse sabor" /></SelectTrigger><SelectContent>{multisaborConfig.classifications.map((x)=><SelectItem key={x.id} value={String(x.id)}>{x.name}</SelectItem>)}</SelectContent></Select><Button size="sm" onClick={saveMultisaborFlavor}>Vincular sabor</Button><div className="space-y-2">{multisaborConfig.flavors.length ? multisaborConfig.flavors.map((x)=><p key={x.id} className="rounded border px-2 py-1 text-sm"><strong>{x.productName}</strong> — {multisaborConfig.classifications.find(c=>c.id===x.classificationId)?.name}</p>) : <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">Vincule produtos do cardápio como sabores.</p>}</div></div>
                  <div className="rounded-lg border p-3 space-y-3 xl:col-span-2"><div><h4 className="font-semibold">Adicionais</h4><p className="text-xs text-muted-foreground">Ex: Bordas, Extras, Cremes, Complementos.</p></div><div className="flex gap-2"><Select value={multisaborAddonGroupId} onValueChange={setMultisaborAddonGroupId}><SelectTrigger><SelectValue placeholder="Grupo de adicionais exibido após os sabores" /></SelectTrigger><SelectContent>{addonGroups.map((x)=><SelectItem key={x.id} value={String(x.id)}>{x.name}</SelectItem>)}</SelectContent></Select><Button size="sm" onClick={saveMultisaborAddon}>Vincular</Button></div><div className="space-y-2">{multisaborConfig.addonGroups.length ? multisaborConfig.addonGroups.map((x)=><div key={x.id} className="flex items-center justify-between rounded border px-2 py-1 text-sm"><span>{x.addonGroupName}</span><Button size="sm" variant="ghost" onClick={()=>removeMultisaborAddon(x.id)}>Remover</Button></div>) : <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">Vincule grupos de adicionais para aparecerem depois dos sabores.</p>}</div></div>
                </div> : null}
              </section>
            </div>
          </CardContent>
        </Card>}

        {!showPizzaMultiflavorConfig && (
          <>
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
          </>
        )}
      </div>

      <ImportMenuDialog open={importDialog} onOpenChange={setImportDialog} />

      <Dialog open={resetDialog} onOpenChange={(open) => { setResetDialog(open); if (!open) setResetConfirmation(""); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Limpar cardápio da loja</DialogTitle>
            <DialogDescription>
              Isso remove produtos, categorias, adicionais e configurações de Multisabor da loja atual. Pedidos, clientes, caixa e fiscal não serão apagados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Esta ação é irreversível e afeta somente os dados de cardápio da loja atual.
            </div>
            {resetLoading && !resetPreview ? <p className="text-sm text-muted-foreground">Carregando prévia...</p> : null}
            {resetPreview ? (
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                {[
                  ["Categorias", resetPreview.categories],
                  ["Produtos", resetPreview.products],
                  ["Variações", resetPreview.variants],
                  ["Grupos de adicionais", resetPreview.addonGroups],
                  ["Opções de adicionais", resetPreview.addonOptions],
                  ["Vínculos produto-adicional", resetPreview.productAddonLinks],
                  ["Configurações pizza antiga", resetPreview.legacyPizzaConfigs],
                  ["Grupos Multisabor", resetPreview.multiflavorGroups],
                  ["Tamanhos Multisabor", resetPreview.multiflavorSizes],
                  ["Classificações Multisabor", resetPreview.multiflavorClassifications],
                  ["Preços Multisabor", resetPreview.multiflavorPrices],
                  ["Sabores Multisabor", resetPreview.multiflavorFlavors],
                  ["Vínculos adicionais Multisabor", resetPreview.multiflavorAddonLinks],
                  ["Itens de pedidos preservados", resetPreview.orderItemsToDetach],
                  ["Adicionais de pedidos preservados", resetPreview.orderItemAddonsToDetach],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded border px-3 py-2">
                    <span>{label}</span><strong>{value}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Digite LIMPAR CARDAPIO para confirmar</Label>
              <Input value={resetConfirmation} onChange={(e) => setResetConfirmation(e.target.value)} placeholder="LIMPAR CARDAPIO" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialog(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={resetLoading || resetConfirmation !== "LIMPAR CARDAPIO"} onClick={confirmMenuReset}>
              Confirmar limpeza do cardápio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Product Dialog */}
      <Dialog open={productDialog} onOpenChange={(o) => { setProductDialog(o); if (!o) { setEditingId(null); setForm(emptyProduct); } }}>
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-5 pr-12">
            <DialogTitle>{editingId ? "Editar Produto" : "Novo Produto"}</DialogTitle>
            <DialogDescription>Preencha os dados do produto.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Produto</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label>Nome *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: X-Burger" data-testid="input-product-name" />
                </div>
                <div className="md:col-span-2">
                  <Label>Descrição</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ingredientes, tamanho, etc." rows={3} data-testid="input-product-description" />
                </div>
                <div>
                  <Label>Preço de venda (R$) *</Label>
                  <Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0,00" data-testid="input-product-price" />
                </div>
                <div>
                  <Label>Categoria *</Label>
                  <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                    <SelectTrigger data-testid="select-product-category"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>{categories?.map((cat) => (<SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 md:col-span-2">
                  <Switch checked={form.available} onCheckedChange={(v) => setForm({ ...form, available: v })} id="available" data-testid="switch-product-available" />
                  <div>
                    <Label htmlFor="available">Disponível para venda</Label>
                    <p className="text-xs text-muted-foreground">Quando desligado, este produto não aparece para venda.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Imagem do produto</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground md:col-span-2">Upload de imagem será habilitado em uma próxima etapa.</div>
                <div><Label>URL da imagem (opcional avançado)</Label><Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." /></div>
                <div><Label>Texto alternativo</Label><Input value={form.imageAlt} onChange={(e) => setForm({ ...form, imageAlt: e.target.value })} /></div>
                {form.imageUrl ? <img src={form.imageUrl} alt={form.imageAlt || form.name || "Prévia"} className="h-28 w-28 rounded-lg border object-cover" /> : null}
              </div>
            </div>

            <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Comercial</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
                <div><Label>Código de barras</Label><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></div>
                <div><Label>Custo (R$)</Label><Input type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} /></div>
                <div><Label>Unidade</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="unidade" /></div>
                <div><Label>Preparo (min)</Label><Input type="number" min="0" step="1" value={form.preparationTimeMinutes} onChange={(e) => setForm({ ...form, preparationTimeMinutes: e.target.value })} /></div>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Estoque opcional</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 md:col-span-2">
                  <Switch checked={form.trackStock} onCheckedChange={(v) => setForm({ ...form, trackStock: v })} id="trackStock" />
                  <Label htmlFor="trackStock">Controlar estoque</Label>
                </div>
                {form.trackStock && (<>
                  <div><Label>Quantidade em estoque</Label><Input type="number" min="0" step="0.01" value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: e.target.value })} /></div>
                  <div><Label>Estoque mínimo</Label><Input type="number" min="0" step="0.01" value={form.stockMinQty} onChange={(e) => setForm({ ...form, stockMinQty: e.target.value })} /></div>
                  <div className="flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 md:col-span-2">
                    <Switch checked={form.allowSaleWithoutStock} onCheckedChange={(v) => setForm({ ...form, allowSaleWithoutStock: v })} id="allowSaleWithoutStock" />
                    <Label htmlFor="allowSaleWithoutStock">Permitir venda sem estoque</Label>
                  </div>
                </>)}
              </div>
            </div>


            <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Adicionais do produto</h3>
              {editingId === null ? (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Salve o produto primeiro para vincular grupos de adicionais.</p>
              ) : addonGroupsLoadFailed ? (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Não foi possível carregar adicionais. Tente atualizar a página.</p>
              ) : addonGroups.length === 0 ? (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Nenhum grupo de adicionais criado ainda.</p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {addonGroups.map((group) => {
                      const checked = productAddonGroupIds.includes(group.id);
                      return (
                        <label key={group.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const nextIds = e.target.checked ? [...productAddonGroupIds, group.id] : productAddonGroupIds.filter((id) => id !== group.id);
                              setProductAddonGroupIds(nextIds);
                            }}
                          />
                          <span>{group.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <Button type="button" variant="outline" onClick={() => saveProductAddonGroups()} disabled={updateProductAddonGroupsMutation.isPending}>
                    {updateProductAddonGroupsMutation.isPending ? "Salvando..." : "Salvar vínculos de adicionais"}
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Variações do produto</h3>
              {editingId === null ? (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Salve o produto primeiro para aplicar um modelo de variação.</p>
              ) : (
                <div className="space-y-4">
                  {loadingVariants ? (
                    <Skeleton className="h-20 w-full" />
                  ) : variants && variants.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {variants.map((variant) => (
                        <div key={variant.id} className="flex min-h-20 items-center justify-between gap-3 rounded-lg border bg-background p-3">
                          <div>
                            <p className="text-sm font-semibold">{variant.name}</p>
                            <p className="text-xs text-muted-foreground">R$ {variant.price.toFixed(2)} • {variant.available ? "Disponível" : "Indisponível"}</p>
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => { setEditingVariantId(variant.id); setVariantForm({ name: variant.name, price: String(variant.price), available: variant.available }); }}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => deleteVariant.mutate({ id: variant.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Nenhuma variação cadastrada ainda.</p>
                  )}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Input placeholder="Nome da variação" value={variantForm.name} onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })} />
                    <Input type="number" step="0.01" min="0" placeholder="Preço" value={variantForm.price} onChange={(e) => setVariantForm({ ...variantForm, price: e.target.value })} />
                    <div className="flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2">
                      <Switch checked={variantForm.available} onCheckedChange={(v) => setVariantForm({ ...variantForm, available: v })} id="variant-available" />
                      <Label htmlFor="variant-available">Disponível para venda</Label>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button type="button" onClick={handleVariantSubmit} disabled={isVariantPending || !variantForm.name.trim() || !variantForm.price}>{editingVariantId ? "Salvar variação" : "Adicionar variação"}</Button>
                      {editingVariantId && (<Button type="button" variant="outline" onClick={() => { setEditingVariantId(null); setVariantForm({ name: "", price: "", available: true }); }}>Cancelar edição</Button>)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Variações gerais/modelos</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <p className="text-sm text-muted-foreground md:col-span-2">Ao aplicar um modelo, as variações serão copiadas para este produto e poderão ser editadas individualmente.</p>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar modelo de variação" /></SelectTrigger>
                  <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={applyTemplateToProduct} disabled={!selectedTemplateId || editingId === null}>Aplicar modelo</Button>
              </div>
            </div>

            {categories?.length === 0 && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-600 dark:bg-amber-900/20">⚠️ Crie uma categoria primeiro antes de adicionar produtos.</p>
            )}
          </div>
          <DialogFooter className="gap-2 border-t bg-background px-6 py-4 sm:space-x-0">
            <Button className="w-full sm:w-auto" onClick={handleSubmit} disabled={isPending || !form.name.trim() || !form.price || !form.categoryId} data-testid="button-submit-product">
              {isPending ? "Salvando..." : editingId ? "Salvar Alterações" : "Criar Produto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={variantTemplatesDialog} onOpenChange={setVariantTemplatesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Variações gerais</DialogTitle>
            <DialogDescription>Cadastre modelos e opções para acelerar o cadastro de variações nos produtos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input placeholder="Nome do modelo" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
              <Input placeholder="Descrição (opcional)" value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveTemplate}>{templateForm.id ? "Salvar modelo" : "Criar modelo"}</Button>
              {templateForm.id > 0 ? (
                <Button variant="outline" onClick={() => setTemplateForm({ id: 0, name: "", description: "" })}>Cancelar edição</Button>
              ) : null}
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Crie um modelo primeiro para adicionar opções.</p>
              ) : templates.map((t) => (
                <div key={t.id} className="rounded border p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{t.name}</p>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setTemplateForm({ id: t.id, name: t.name, description: t.description ?? "" })}>Editar</Button>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => removeTemplate(t.id)}>Remover</Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.description ?? "Sem descrição"}</p>
                  <div className="space-y-1">
                    {(templateOptionsMap[t.id] ?? []).map((op) => (
                      <div key={op.id} className="flex items-center justify-between rounded border p-1.5 text-xs">
                        <p>{op.name} • R$ {op.price.toFixed(2)} • {op.available ? "Disponível" : "Indisponível"}</p>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => { setEditingTemplateOptionId(op.id); setTemplateOptionForm({ templateId: t.id, name: op.name, price: String(op.price), available: op.available }); }}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => removeTemplateOption(op.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <Input placeholder="Opção" value={templateOptionForm.templateId === t.id ? templateOptionForm.name : ""} onChange={(e) => setTemplateOptionForm({ ...templateOptionForm, templateId: t.id, name: e.target.value })} />
                    <Input type="number" step="0.01" min="0" placeholder="Preço" value={templateOptionForm.templateId === t.id ? templateOptionForm.price : ""} onChange={(e) => setTemplateOptionForm({ ...templateOptionForm, templateId: t.id, price: e.target.value })} />
                    <div className="flex items-center gap-2 rounded border px-2">
                      <Switch checked={templateOptionForm.templateId === t.id ? templateOptionForm.available : true} onCheckedChange={(v) => setTemplateOptionForm({ ...templateOptionForm, templateId: t.id, available: v })} id={`template-option-available-${t.id}`} />
                      <Label htmlFor={`template-option-available-${t.id}`}>Opção disponível</Label>
                    </div>
                    <Button variant="outline" onClick={saveTemplateOption}>{editingTemplateOptionId > 0 && templateOptionForm.templateId === t.id ? "Salvar opção" : "Adicionar opção"}</Button>
                  </div>
                  {editingTemplateOptionId > 0 && templateOptionForm.templateId === t.id ? (
                    <Button size="sm" variant="ghost" onClick={() => { setEditingTemplateOptionId(0); setTemplateOptionForm({ templateId: t.id, name: "", price: "", available: true }); }}>
                      Cancelar edição da opção
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Addons Dialog */}
      <Dialog open={addonDialog} onOpenChange={(open) => { setAddonDialog(open); if (!open) { setEditingAddonGroupId(0); setEditingAddonOptionId(0); setAddonGroupForm({ name: "", description: "", required: false, minSelected: "0", maxSelected: "", active: true }); setAddonOptionForm({ groupId: 0, name: "", price: "", available: true }); } }}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerenciar Adicionais</DialogTitle>
            <DialogDescription>
              Crie grupos de adicionais e opções para vincular aos produtos do cardápio.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
            Somente Max Control pode criar ou editar adicionais. Atendentes apenas usam os adicionais no pedido.
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
            <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {editingAddonGroupId ? "Editar grupo" : "Novo grupo de adicionais"}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">Ex.: Bordas, Molhos, Extras, Bebidas.</p>
              </div>
              <div className="space-y-3">
                <div>
                  <Label>Nome do grupo</Label>
                  <Input value={addonGroupForm.name} onChange={(e) => setAddonGroupForm({ ...addonGroupForm, name: e.target.value })} placeholder="Ex: Molhos" />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea value={addonGroupForm.description} onChange={(e) => setAddonGroupForm({ ...addonGroupForm, description: e.target.value })} placeholder="Descrição opcional" rows={2} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Mínimo</Label>
                    <Input type="number" min="0" value={addonGroupForm.minSelected} onChange={(e) => setAddonGroupForm({ ...addonGroupForm, minSelected: e.target.value })} />
                  </div>
                  <div>
                    <Label>Máximo</Label>
                    <Input type="number" min="0" value={addonGroupForm.maxSelected} onChange={(e) => setAddonGroupForm({ ...addonGroupForm, maxSelected: e.target.value })} placeholder="Sem limite" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <Switch checked={addonGroupForm.required} onCheckedChange={(checked) => setAddonGroupForm({ ...addonGroupForm, required: checked })} />
                    Obrigatório
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <Switch checked={addonGroupForm.active} onCheckedChange={(checked) => setAddonGroupForm({ ...addonGroupForm, active: checked })} />
                    Ativo
                  </label>
                </div>
                {addonGroupForm.required && Number(addonGroupForm.minSelected || 0) === 0 ? (
                  <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Com obrigatório ligado e mínimo 0, o cadastro será salvo com mínimo 0, mas no pedido será exigida pelo menos 1 opção.
                  </p>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={submitAddonGroup} disabled={!addonGroupForm.name.trim() || createAddonGroupMutation.isPending || updateAddonGroupMutation.isPending}>
                    {editingAddonGroupId ? "Salvar grupo" : "Criar grupo"}
                  </Button>
                  {editingAddonGroupId ? (
                    <Button variant="outline" onClick={() => { setEditingAddonGroupId(0); setAddonGroupForm({ name: "", description: "", required: false, minSelected: "0", maxSelected: "", active: true }); }}>
                      Cancelar edição
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {addonGroupsLoadFailed ? (
                <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                  {addonGroupsError
                    ? getAddonApiErrorMessage(addonGroupsError, "Não foi possível carregar adicionais. Tente atualizar a página.")
                    : "Não foi possível carregar adicionais. Tente atualizar a página."}
                </p>
              ) : fetchingAddonGroups ? (
                <Skeleton className="h-36 w-full" />
              ) : addonGroups.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  <p className="font-medium">Nenhum grupo de adicionais criado ainda.</p>
                  <p className="mt-1">Crie o primeiro grupo para adicionar opções e depois vinculá-lo aos produtos.</p>
                </div>
              ) : (
                addonGroups.map((group) => {
                  const groupOptions = Array.isArray(group.options) ? group.options : [];
                  const editingThisGroupOption = addonOptionForm.groupId === group.id;
                  return (
                    <div key={group.id} className={`rounded-xl border bg-card p-4 shadow-sm ${group.active ? "" : "opacity-70"}`}>
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">{group.name}</h3>
                            <Badge variant={group.active ? "default" : "outline"}>{group.active ? "Ativo" : "Inativo"}</Badge>
                            {group.required ? <Badge variant="outline">Obrigatório</Badge> : null}
                          </div>
                          {group.description ? <p className="mt-1 text-sm text-muted-foreground">{group.description}</p> : null}
                          <p className="mt-1 text-xs text-muted-foreground">
                            Seleção: mín. {group.minSelected ?? 0}{group.maxSelected != null ? ` • máx. ${group.maxSelected}` : " • sem máximo"}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => editAddonGroup(group)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="outline" onClick={() => toggleAddonGroup(group)}>{group.active ? "Desativar" : "Ativar"}</Button>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Opções ({groupOptions.length})</Label>
                          {!editingThisGroupOption ? (
                            <Button size="sm" variant="outline" onClick={() => { setEditingAddonOptionId(0); setAddonOptionForm({ groupId: group.id, name: "", price: "", available: true }); }}>
                              <Plus className="mr-1.5 h-3.5 w-3.5" /> Opção
                            </Button>
                          ) : null}
                        </div>

                        {groupOptions.length === 0 ? (
                          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Nenhuma opção criada neste grupo.</p>
                        ) : (
                          <div className="space-y-2">
                            {groupOptions.map((option) => (
                              <div key={option.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-sm font-medium">{option.name}</p>
                                  <p className="text-xs text-muted-foreground">R$ {option.price.toFixed(2)} • {option.available ? "Disponível" : "Indisponível"}</p>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => editAddonOption(option)}><Pencil className="h-3.5 w-3.5" /></Button>
                                  <Button size="sm" variant="outline" onClick={() => toggleAddonOption(option)}>{option.available ? "Desativar" : "Ativar"}</Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {editingThisGroupOption ? (
                          <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 md:grid-cols-[1fr_140px]">
                            <div>
                              <Label>Nome da opção</Label>
                              <Input value={addonOptionForm.name} onChange={(e) => setAddonOptionForm({ ...addonOptionForm, name: e.target.value })} placeholder="Ex: Bacon extra" />
                            </div>
                            <div>
                              <Label>Preço (R$)</Label>
                              <Input type="number" min="0" step="0.01" value={addonOptionForm.price} onChange={(e) => setAddonOptionForm({ ...addonOptionForm, price: e.target.value })} />
                            </div>
                            <div className="flex items-center gap-2 md:col-span-2">
                              <Switch checked={addonOptionForm.available} onCheckedChange={(checked) => setAddonOptionForm({ ...addonOptionForm, available: checked })} />
                              <Label>Disponível para venda</Label>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row md:col-span-2">
                              <Button onClick={submitAddonOption} disabled={!addonOptionForm.name.trim() || createAddonOptionMutation.isPending || updateAddonOptionMutation.isPending}>
                                {editingAddonOptionId ? "Salvar opção" : "Criar opção"}
                              </Button>
                              <Button variant="outline" onClick={() => { setEditingAddonOptionId(0); setAddonOptionForm({ groupId: 0, name: "", price: "", available: true }); }}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddonDialog(false)}>Fechar</Button>
          </DialogFooter>
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
