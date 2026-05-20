import { useState } from "react";
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
  useDeleteCategory,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Pencil, Trash2, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ProductForm = {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  available: boolean;
};

const emptyProduct: ProductForm = {
  name: "",
  description: "",
  price: "",
  categoryId: "",
  available: true,
};

export default function Menu() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [productDialog, setProductDialog] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyProduct);
  const [newCategory, setNewCategory] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const params: Record<string, unknown> = {};
  if (search) params.search = search;
  if (selectedCategory !== "all") params.categoryId = parseInt(selectedCategory);

  const { data: products, isLoading: loadingProducts } = useListProducts(params, {
    query: { queryKey: getListProductsQueryKey(params) },
  });

  const { data: categories } = useListCategories({
    query: { queryKey: getListCategoriesQueryKey() },
  });

  const createProduct = useCreateProduct({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        setProductDialog(false);
        setForm(emptyProduct);
        toast({ title: "Produto criado" });
      },
    },
  });

  const updateProduct = useUpdateProduct({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        setProductDialog(false);
        setEditingId(null);
        setForm(emptyProduct);
        toast({ title: "Produto atualizado" });
      },
    },
  });

  const deleteProduct = useDeleteProduct({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        toast({ title: "Produto removido" });
      },
    },
  });

  const createCategory = useCreateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        setCategoryDialog(false);
        setNewCategory("");
        toast({ title: "Categoria criada" });
      },
    },
  });

  const deleteCategory = useDeleteCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        toast({ title: "Categoria removida" });
      },
    },
  });

  const openEdit = (p: NonNullable<typeof products>[number]) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      description: p.description ?? "",
      price: String(p.price),
      categoryId: String(p.categoryId),
      available: p.available,
    });
    setProductDialog(true);
  };

  const handleSubmit = () => {
    if (!form.name || !form.price || !form.categoryId) return;
    const data = {
      name: form.name,
      description: form.description || undefined,
      price: parseFloat(form.price),
      categoryId: parseInt(form.categoryId),
      available: form.available,
    };
    if (editingId !== null) {
      updateProduct.mutate({ id: editingId, data });
    } else {
      createProduct.mutate({ data });
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cardapio</h1>
            <p className="text-muted-foreground mt-1">Produtos e categorias</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCategoryDialog(true)} data-testid="button-new-category">
              <Tag className="w-4 h-4 mr-2" /> Categoria
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
        ) : products?.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">Nenhum produto encontrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products?.map((product) => (
              <Card
                key={product.id}
                className={`transition-all hover:shadow-md ${!product.available ? "opacity-60" : ""}`}
                data-testid={`card-product-${product.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold truncate">{product.name}</p>
                        {!product.available && (
                          <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded dark:bg-red-900/30 dark:text-red-400">
                            Indisponivel
                          </span>
                        )}
                      </div>
                      {product.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="font-bold text-primary text-lg">
                          R$ {product.price.toFixed(2)}
                        </span>
                        {product.categoryName && (
                          <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                            {product.categoryName}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
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
                        onClick={() => deleteProduct.mutate({ id: product.id })}
                        disabled={deleteProduct.isPending}
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
      </div>

      {/* Product Dialog */}
      <Dialog open={productDialog} onOpenChange={setProductDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-product-name" />
            </div>
            <div>
              <Label>Descricao</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} data-testid="input-product-description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Preco (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
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
            <div className="flex items-center gap-3">
              <Switch
                checked={form.available}
                onCheckedChange={(v) => setForm({ ...form, available: v })}
                id="available"
                data-testid="switch-product-available"
              />
              <Label htmlFor="available">Disponivel no cardapio</Label>
            </div>
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={createProduct.isPending || updateProduct.isPending || !form.name || !form.price || !form.categoryId}
              data-testid="button-submit-product"
            >
              {editingId ? "Salvar" : "Criar Produto"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={categoryDialog} onOpenChange={setCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Nome *</Label>
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                data-testid="input-category-name"
              />
            </div>
            {categories && categories.length > 0 && (
              <div>
                <Label className="mb-2 block">Categorias existentes</Label>
                <div className="space-y-2">
                  {categories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg bg-muted">
                      <span className="text-sm font-medium">{cat.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive h-7 w-7 p-0"
                        onClick={() => deleteCategory.mutate({ id: cat.id })}
                        data-testid={`button-delete-category-${cat.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button
              className="w-full"
              onClick={() => { if (newCategory.trim()) createCategory.mutate({ data: { name: newCategory } }); }}
              disabled={createCategory.isPending || !newCategory.trim()}
              data-testid="button-submit-category"
            >
              Criar Categoria
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
