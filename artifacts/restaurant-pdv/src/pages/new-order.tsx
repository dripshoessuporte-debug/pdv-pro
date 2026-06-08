import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import {
  useListTables,
  getListTablesQueryKey,
  useListCustomers,
  getListCustomersQueryKey,
  useListCategories,
  getListCategoriesQueryKey,
  useListProducts,
  getListProductsQueryKey,
  useCreateOrder,
  useAddOrderItem,
  useCreateCustomer,
  useUpdateCustomer,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Minus,
  ShoppingCart,
  Search,
  MessageSquare,
  Truck,
  Banknote,
  Smartphone,
  CreditCard,
  Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getCurrentActor } from "@/lib/rbac";

type OrderType = "counter" | "table" | "takeaway" | "delivery";

type AddonOption = {
  id: number;
  groupId: number;
  name: string;
  price: number;
  available: boolean;
  sortOrder?: number;
};

type AddonGroup = {
  id: number;
  name: string;
  description?: string | null;
  required: boolean;
  minSelected: number;
  maxSelected?: number | null;
  active: boolean;
  options: AddonOption[];
};

type SelectedAddon = {
  addonOptionId: number;
  groupId: number;
  groupName: string;
  name: string;
  price: number;
  quantity: number;
};

type CartItem = {
  productId: number;
  variantId: number | null;
  name: string;
  variantName: string | null;
  price: number;
  quantity: number;
  notes: string;
  addons: SelectedAddon[];
  addonKey: string;
};

type CustomerOption = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

type SavedCustomer = {
  id: number;
  name: string;
  phone?: string | null;
  notes?: string | null;
};

const onlyDigits = (value: string) => value.replace(/\D/g, "");

const buildDeliveryAddressNote = ({
  cep,
  address,
  neighborhood,
  reference,
}: {
  cep: string;
  address: string;
  neighborhood: string;
  reference: string;
}) => {
  const parts = [
    address.trim(),
    neighborhood.trim() ? `Bairro: ${neighborhood.trim()}` : "",
    cep.trim() ? `CEP: ${cep.trim()}` : "",
    reference.trim() ? `Ref.: ${reference.trim()}` : "",
  ].filter(Boolean);

  return parts.length > 0 ? `Endereço delivery: ${parts.join(" · ")}` : "";
};

const extractErrorMessage = (error: unknown) => {
  if (error && typeof error === "object") {
    const data =
      "data" in error ? (error as { data?: unknown }).data : undefined;
    if (data && typeof data === "object") {
      const errorText =
        (data as { error?: unknown; message?: unknown; detail?: unknown })
          .error ??
        (data as { error?: unknown; message?: unknown; detail?: unknown })
          .message ??
        (data as { error?: unknown; message?: unknown; detail?: unknown })
          .detail;
      if (typeof errorText === "string" && errorText.trim()) return errorText;
    }

    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  if (typeof error === "string" && error.trim()) return error;

  return "Erro ao criar pedido. Tente novamente.";
};

export default function NewOrder() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const preselectedTableId = params.get("tableId");

  const actor = getCurrentActor();
  const canUseCustomerDirectory = actor.role === "max_control";

  const [orderType, setOrderType] = useState<OrderType>("counter");
  const [tableId, setTableId] = useState(preselectedTableId ?? "");
  const [customerId, setCustomerId] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [productSearch, setProductSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [variantProduct, setVariantProduct] = useState<{
    id: number;
    name: string;
    price: number;
  } | null>(null);
  const [variantOptions, setVariantOptions] = useState<
    Array<{
      id: number;
      name: string;
      price: number;
      active: boolean;
      available: boolean;
    }>
  >([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(
    null,
  );
  const [addonModalOpen, setAddonModalOpen] = useState(false);
  const [addonProduct, setAddonProduct] = useState<{
    id: number;
    name: string;
    price: number;
    variant?: { id: number; name: string; price: number };
  } | null>(null);
  const [addonGroups, setAddonGroups] = useState<AddonGroup[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<Record<number, SelectedAddon>>({});

  // Delivery / takeaway fields
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [autoSaveCustomer, setAutoSaveCustomer] = useState(
    canUseCustomerDirectory,
  );
  const [deliveryCep, setDeliveryCep] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState("");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  // Payment on delivery
  const [paymentTiming, setPaymentTiming] = useState<"now" | "on_delivery">(
    "now",
  );
  const [deliveryPaymentMethod, setDeliveryPaymentMethod] = useState<
    "dinheiro" | "pix" | "cartao"
  >("dinheiro");
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState("");
  const [deliveryPaymentNotes, setDeliveryPaymentNotes] = useState("");

  const [feeAutoCalculated, setFeeAutoCalculated] = useState(false);
  const [feeCalcInfo, setFeeCalcInfo] = useState<{
    storeCep: string;
    distanceKm: number;
    distanceSource: string;
    mode: string;
    pricePerKm?: number;
    baseDistanceKm?: number;
    baseFee?: number;
    additionalPricePerKm?: number;
    fee: number;
  } | null>(null);
  const [storeSettings, setStoreSettings] = useState<{
    deliveryFeeMode: string;
    storeCep: string | null;
    storeAddress: string | null;
    storeCity: string | null;
    distanceProvider: string;
    deliveryPricePerKm: number | null;
    baseDeliveryDistanceKm: number | null;
    baseDeliveryFee: number | null;
    additionalPricePerKm: number | null;
    minimumDeliveryFee: number | null;
    maximumDeliveryFee: number | null;
  } | null>(null);
  const [cepLookupStatus, setCepLookupStatus] = useState<
    "idle" | "loading" | "found" | "not_found"
  >("idle");
  const [distanceCalcStatus, setDistanceCalcStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tables } = useListTables({
    query: { queryKey: getListTablesQueryKey() },
  });
  const { data: customers } = useListCustomers(
    {},
    {
      query: {
        queryKey: getListCustomersQueryKey({}),
        enabled: canUseCustomerDirectory,
      },
    },
  );
  const { data: categories } = useListCategories({
    query: { queryKey: getListCategoriesQueryKey() },
  });

  const productParams: Record<string, unknown> = { availableOnly: true };
  if (categoryFilter !== "all")
    productParams.categoryId = parseInt(categoryFilter);
  if (productSearch) productParams.search = productSearch;

  const { data: products, isLoading: loadingProducts } = useListProducts(
    productParams,
    {
      query: { queryKey: getListProductsQueryKey(productParams) },
    },
  );

  const createOrder = useCreateOrder();
  const addItem = useAddOrderItem();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();

  useEffect(() => {
    if (preselectedTableId) {
      setOrderType("table");
      setTableId(preselectedTableId);
    }
  }, [preselectedTableId]);

  // Load store settings once for delivery fee calculation
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        // API returns numeric DB columns as strings — parse explicitly
        const pf = (v: unknown) =>
          v != null && v !== "" ? parseFloat(String(v)) : null;
        const rawMode = String(s.deliveryFeeMode || "manual");
        setStoreSettings({
          deliveryFeeMode: rawMode === "per_km" ? "distance_tier" : rawMode,
          storeCep: s.storeCep ? String(s.storeCep) : null,
          storeAddress: s.storeAddress ? String(s.storeAddress) : null,
          storeCity: s.storeCity ? String(s.storeCity) : null,
          distanceProvider: String(s.distanceProvider || "approximate_cep"),
          deliveryPricePerKm: pf(s.deliveryPricePerKm),
          baseDeliveryDistanceKm: pf(s.baseDeliveryDistanceKm),
          baseDeliveryFee: pf(s.baseDeliveryFee),
          additionalPricePerKm: pf(s.additionalPricePerKm),
          minimumDeliveryFee: pf(s.minimumDeliveryFee),
          maximumDeliveryFee: pf(s.maximumDeliveryFee),
        });
      })
      .catch(() => {
        /* silent — fee calculation just stays manual */
      });
  }, []);

  // ViaCEP lookup when customer CEP has 8 digits
  useEffect(() => {
    const digits = deliveryCep.replace(/\D/g, "");
    if (digits.length !== 8) {
      setCepLookupStatus("idle");
      return;
    }
    let cancelled = false;
    setCepLookupStatus("loading");
    fetch(`https://viacep.com.br/ws/${digits}/json/`)
      .then((r) => r.json())
      .then(
        (data: {
          erro?: boolean;
          logradouro?: string;
          bairro?: string;
          localidade?: string;
          uf?: string;
        }) => {
          if (cancelled) return;
          if (data.erro) {
            setCepLookupStatus("not_found");
            return;
          }
          setCepLookupStatus("found");
          if (!deliveryAddress && data.logradouro)
            setDeliveryAddress(data.logradouro);
          if (!deliveryNeighborhood && data.bairro)
            setDeliveryNeighborhood(data.bairro);
        },
      )
      .catch(() => {
        if (!cancelled) setCepLookupStatus("not_found");
      });
    return () => {
      cancelled = true;
    };
  }, [deliveryCep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-calculate delivery fee — calls the server-side distance endpoint
  // (uses ORS when configured, falls back to CEP estimation automatically)
  useEffect(() => {
    if (orderType !== "delivery") return;
    const mode = storeSettings?.deliveryFeeMode;
    if (!storeSettings || (mode !== "per_km" && mode !== "distance_tier"))
      return;

    if (!storeSettings.storeCep) {
      if (feeAutoCalculated) {
        setDeliveryFee("");
        setFeeAutoCalculated(false);
        setFeeCalcInfo(null);
      }
      return;
    }

    const digits = deliveryCep.replace(/\D/g, "");
    if (digits.length !== 8) {
      if (feeAutoCalculated) {
        setDeliveryFee("");
        setFeeAutoCalculated(false);
        setFeeCalcInfo(null);
      }
      setDistanceCalcStatus("idle");
      return;
    }

    let cancelled = false;
    setDistanceCalcStatus("loading");

    const calculate = async () => {
      try {
        const res = await fetch("/api/delivery/distance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerCep: digits,
            customerAddress: deliveryAddress || undefined,
            customerCity: undefined,
          }),
        });
        if (cancelled) return;
        if (!res.ok) {
          setDistanceCalcStatus("error");
          return;
        }

        const { distanceKm, source } = (await res.json()) as {
          distanceKm: number;
          source: string;
        };

        let fee: number;
        if (mode === "distance_tier") {
          const baseDist = storeSettings.baseDeliveryDistanceKm ?? 4;
          const baseFee = storeSettings.baseDeliveryFee ?? 0;
          const addlPerKm = storeSettings.additionalPricePerKm ?? 0;
          fee =
            distanceKm <= baseDist
              ? baseFee
              : baseFee + (distanceKm - baseDist) * addlPerKm;
          if (
            storeSettings.minimumDeliveryFee &&
            fee < storeSettings.minimumDeliveryFee
          )
            fee = storeSettings.minimumDeliveryFee;
          const effMax = storeSettings.maximumDeliveryFee ?? 30;
          if (fee > effMax) fee = effMax;
          fee = Math.round(fee * 100) / 100;
          setDeliveryFee(String(fee));
          setFeeAutoCalculated(true);
          setFeeCalcInfo({
            storeCep: storeSettings.storeCep!,
            distanceKm,
            distanceSource: source,
            mode: "distance_tier",
            baseDistanceKm: baseDist,
            baseFee,
            additionalPricePerKm: addlPerKm,
            fee,
          });
        } else {
          if (!storeSettings.deliveryPricePerKm) return;
          fee = distanceKm * storeSettings.deliveryPricePerKm;
          if (
            storeSettings.minimumDeliveryFee &&
            fee < storeSettings.minimumDeliveryFee
          )
            fee = storeSettings.minimumDeliveryFee;
          const effMax = storeSettings.maximumDeliveryFee ?? 30;
          if (fee > effMax) fee = effMax;
          fee = Math.round(fee * 100) / 100;
          setDeliveryFee(String(fee));
          setFeeAutoCalculated(true);
          setFeeCalcInfo({
            storeCep: storeSettings.storeCep!,
            distanceKm,
            distanceSource: source,
            mode: "per_km",
            pricePerKm: storeSettings.deliveryPricePerKm,
            fee,
          });
        }
        setDistanceCalcStatus("done");
      } catch {
        if (!cancelled) setDistanceCalcStatus("error");
      }
    };

    calculate();
    return () => {
      cancelled = true;
    };
  }, [deliveryCep, orderType, storeSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildAddonKey = (addons: SelectedAddon[]) =>
    addons
      .filter((addon) => addon.quantity > 0)
      .sort((a, b) => a.addonOptionId - b.addonOptionId)
      .map((addon) => `${addon.addonOptionId}:${addon.quantity}`)
      .join("|");

  const addToCart = (
    product: { id: number; name: string; price: number },
    variant?: { id: number; name: string; price: number },
    addons: SelectedAddon[] = [],
  ) => {
    const addonKey = buildAddonKey(addons);
    const addonsTotal = addons.reduce(
      (sum, addon) => sum + addon.price * addon.quantity,
      0,
    );
    setCart((prev) => {
      const existing = prev.find(
        (i) =>
          i.productId === product.id &&
          i.variantId === (variant?.id ?? null) &&
          i.addonKey === addonKey,
      );
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id &&
          i.variantId === (variant?.id ?? null) &&
          i.addonKey === addonKey
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          variantId: variant?.id ?? null,
          name: product.name,
          variantName: variant?.name ?? null,
          price: (variant?.price ?? product.price) + addonsTotal,
          quantity: 1,
          notes: "",
          addons,
          addonKey,
        },
      ];
    });
  };

  const openAddonStep = async (
    product: { id: number; name: string; price: number },
    variant?: { id: number; name: string; price: number },
  ) => {
    const response = await fetch(`/api/menu/products/${product.id}/addon-groups`);
    const groups = ((await response.json()) as AddonGroup[]).filter(
      (group) => group.active,
    );
    if (groups.length === 0) return addToCart(product, variant);
    setAddonProduct({ ...product, variant });
    setAddonGroups(groups);
    setSelectedAddons({});
    setAddonModalOpen(true);
  };

  const removeFromCart = (productId: number, variantId: number | null, addonKey = "") => {
    setCart((prev) => {
      const existing = prev.find(
        (i) => i.productId === productId && i.variantId === variantId && i.addonKey === addonKey,
      );
      if (existing && existing.quantity > 1) {
        return prev.map((i) =>
          i.productId === productId && i.variantId === variantId && i.addonKey === addonKey
            ? { ...i, quantity: i.quantity - 1 }
            : i,
        );
      }
      return prev.filter(
        (i) => !(i.productId === productId && i.variantId === variantId && i.addonKey === addonKey),
      );
    });
  };

  const updateItemNotes = (
    productId: number,
    variantId: number | null,
    addonKey: string,
    notes: string,
  ) => {
    setCart((prev) =>
      prev.map((i) =>
        i.productId === productId && i.variantId === variantId && i.addonKey === addonKey
          ? { ...i, notes }
          : i,
      ),
    );
  };

  const cartSubtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const parsedFee = orderType === "delivery" ? parseFloat(deliveryFee) || 0 : 0;
  const cartTotal = cartSubtotal + parsedFee;
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const customerOptions = canUseCustomerDirectory ? customers : [];
  const selectedCustomer = customerOptions?.find(
    (c) => String(c.id) === customerId,
  ) as CustomerOption | undefined;
  const customerFormHasData = Boolean(
    customerName.trim() ||
    customerPhone.trim() ||
    deliveryAddress.trim() ||
    deliveryNeighborhood.trim() ||
    deliveryReference.trim(),
  );
  const canAutoSaveCustomer =
    autoSaveCustomer &&
    !customerId &&
    customerFormHasData &&
    Boolean(customerName.trim() && customerPhone.trim());

  const selectCustomer = (value: string) => {
    const nextCustomerId = value === "none" ? "" : value;
    setCustomerId(nextCustomerId);

    const customer = customerOptions?.find(
      (c) => String(c.id) === nextCustomerId,
    );
    if (!customer) return;

    if (!customerName.trim()) setCustomerName(customer.name);
    if (!customerPhone.trim() && customer.phone)
      setCustomerPhone(customer.phone);
  };

  const saveCustomerForOrder = async (): Promise<number | undefined> => {
    if (customerId) return parseInt(customerId);
    if (!canUseCustomerDirectory || !canAutoSaveCustomer) return undefined;

    const phoneDigits = onlyDigits(customerPhone);
    const addressNote =
      orderType === "delivery"
        ? buildDeliveryAddressNote({
            cep: deliveryCep,
            address: deliveryAddress,
            neighborhood: deliveryNeighborhood,
            reference: deliveryReference,
          })
        : "";

    const existingCustomer = phoneDigits
      ? customerOptions?.find(
          (customer) =>
            customer.phone && onlyDigits(customer.phone) === phoneDigits,
        )
      : undefined;

    if (existingCustomer) {
      const nextNotes =
        addressNote && !existingCustomer.notes?.includes(addressNote)
          ? [existingCustomer.notes, addressNote].filter(Boolean).join("\n")
          : (existingCustomer.notes ?? undefined);

      const updated = await new Promise<SavedCustomer>((resolve, reject) => {
        updateCustomer.mutate(
          {
            id: existingCustomer.id,
            data: {
              name: customerName.trim() || existingCustomer.name,
              phone:
                customerPhone.trim() || existingCustomer.phone || undefined,
              ...(nextNotes ? { notes: nextNotes } : {}),
            },
          },
          {
            onSuccess: (customer) => resolve(customer),
            onError: (e) => reject(e),
          },
        );
      });

      setCustomerId(String(updated.id));
      return updated.id;
    }

    const created = await new Promise<SavedCustomer>((resolve, reject) => {
      createCustomer.mutate(
        {
          data: {
            name: customerName.trim(),
            phone: customerPhone.trim(),
            ...(addressNote ? { notes: addressNote } : {}),
          },
        },
        {
          onSuccess: (customer) => resolve(customer),
          onError: (e) => reject(e),
        },
      );
    });

    setCustomerId(String(created.id));
    return created.id;
  };

  const handleCreate = async () => {
    if (cart.length === 0) {
      toast({
        title: "Adicione pelo menos um item ao pedido",
        variant: "destructive",
      });
      return;
    }
    if (orderType === "table" && !tableId) {
      toast({ title: "Selecione uma mesa", variant: "destructive" });
      return;
    }
    if (orderType === "delivery") {
      if (!customerName.trim()) {
        toast({
          title: "Nome do cliente é obrigatório para delivery",
          variant: "destructive",
        });
        return;
      }
      if (!customerPhone.trim()) {
        toast({
          title: "Telefone é obrigatório para delivery",
          variant: "destructive",
        });
        return;
      }
      if (!deliveryAddress.trim()) {
        toast({
          title: "Endereço é obrigatório para delivery",
          variant: "destructive",
        });
        return;
      }
      if (!deliveryNeighborhood.trim()) {
        toast({
          title: "Bairro é obrigatório para delivery",
          variant: "destructive",
        });
        return;
      }
    }

    setCreating(true);
    try {
      const savedCustomerId = await saveCustomerForOrder();

      // Build order payload
      const orderData: Record<string, unknown> = { type: orderType };

      if (tableId) orderData.tableId = parseInt(tableId);
      if (savedCustomerId) orderData.customerId = savedCustomerId;
      if (orderNotes.trim()) orderData.notes = orderNotes.trim();

      if (orderType === "delivery") {
        // All delivery fields
        orderData.customerName = customerName.trim();
        orderData.customerPhone = customerPhone.trim();
        if (deliveryCep.trim()) orderData.deliveryCep = deliveryCep.trim();
        orderData.deliveryAddress = deliveryAddress.trim();
        orderData.deliveryNeighborhood = deliveryNeighborhood.trim();
        if (deliveryReference.trim())
          orderData.deliveryReference = deliveryReference.trim();
        if (deliveryNotes.trim())
          orderData.deliveryNotes = deliveryNotes.trim();
        orderData.deliveryFee = parsedFee;
        orderData.paymentTiming = paymentTiming;
        if (paymentTiming === "on_delivery") {
          orderData.deliveryPaymentMethod = deliveryPaymentMethod;
          orderData.needsChange = needsChange;
          if (needsChange && changeFor.trim()) {
            orderData.changeFor = parseFloat(changeFor.replace(",", "."));
          }
          if (deliveryPaymentNotes.trim())
            orderData.deliveryPaymentNotes = deliveryPaymentNotes.trim();
        }
      } else {
        // Balcão, viagem e mesa: identificação avulsa opcional, sem exigir telefone/endereço
        if (customerName.trim()) orderData.customerName = customerName.trim();
        if (orderType === "takeaway" && customerPhone.trim())
          orderData.customerPhone = customerPhone.trim();
      }

      const order = await new Promise<{ id: number }>((resolve, reject) => {
        createOrder.mutate(
          {
            data: orderData as unknown as Parameters<
              typeof createOrder.mutate
            >[0]["data"],
          },
          { onSuccess: (o) => resolve(o), onError: (e) => reject(e) },
        );
      });

      for (const item of cart) {
        await new Promise<void>((resolve, reject) => {
          addItem.mutate(
            {
              id: order.id,
              data: {
                productId: item.productId,
                quantity: item.quantity,
                ...(item.variantId != null
                  ? { variantId: item.variantId }
                  : {}),
                ...(item.notes.trim() ? { notes: item.notes.trim() } : {}),
                ...(item.addons.length
                  ? {
                      addons: item.addons.map((addon) => ({
                        addonOptionId: addon.addonOptionId,
                        quantity: addon.quantity,
                      })),
                    }
                  : {}),
              },
            },
            { onSuccess: () => resolve(), onError: (e) => reject(e) },
          );
        });
      }

      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey({}) });
      toast({ title: "Pedido criado com sucesso!" });
      setLocation(`/orders/${order.id}`);
    } catch (error) {
      toast({
        title: "Erro ao criar pedido",
        description: extractErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };


  const toggleAddon = (group: AddonGroup, option: AddonOption) => {
    if (!option.available) return;
    setSelectedAddons((prev) => {
      const current = prev[option.id];
      if (current) {
        const next = { ...prev };
        delete next[option.id];
        return next;
      }
      const groupSelected = Object.values(prev).filter(
        (addon) => addon.groupId === group.id,
      );
      if (group.maxSelected != null && groupSelected.length >= group.maxSelected) {
        toast({
          title: `Selecione no máximo ${group.maxSelected} em ${group.name}`,
          variant: "destructive",
        });
        return prev;
      }
      return {
        ...prev,
        [option.id]: {
          addonOptionId: option.id,
          groupId: group.id,
          groupName: group.name,
          name: option.name,
          price: option.price,
          quantity: 1,
        },
      };
    });
  };

  const selectedAddonList = Object.values(selectedAddons);
  const addonValidationError = addonGroups
    .map((group) => {
      const selectedCount = selectedAddonList.filter(
        (addon) => addon.groupId === group.id,
      ).length;
      const minimum = group.required ? Math.max(1, group.minSelected) : group.minSelected;
      if (selectedCount < minimum) return `Selecione pelo menos ${minimum} em ${group.name}.`;
      if (group.maxSelected != null && selectedCount > group.maxSelected)
        return `Selecione no máximo ${group.maxSelected} em ${group.name}.`;
      return null;
    })
    .find(Boolean);
  const addonBasePrice = addonProduct?.variant?.price ?? addonProduct?.price ?? 0;
  const addonTotal = addonBasePrice + selectedAddonList.reduce((sum, addon) => sum + addon.price * addon.quantity, 0);

  const ORDER_TYPES: { value: OrderType; label: string }[] = [
    { value: "counter", label: "🍽 Balcão" },
    { value: "table", label: "🪑 Mesa" },
    { value: "takeaway", label: "🛵 Viagem" },
    { value: "delivery", label: "🚚 Delivery" },
  ];

  const handleProductClick = async (product: {
    id: number;
    name: string;
    price: number;
  }) => {
    const response = await fetch(`/api/menu/products/${product.id}/variants`);
    const variants = (await response.json()) as Array<{
      id: number;
      name: string;
      price: number;
      active: boolean;
      available: boolean;
    }>;
    const activeVariants = variants.filter((v) => v.active && v.available);
    if (activeVariants.length === 0) return openAddonStep(product);
    setVariantProduct(product);
    setVariantOptions(activeVariants);
    setSelectedVariantId(null);
    setVariantModalOpen(true);
  };

  return (
    <Layout>
      <div className="space-y-8 pb-24 lg:pb-28">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Novo Pedido</h1>
          <p className="text-muted-foreground mt-1">
            Configure o pedido e adicione itens
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
          {/* Esquerda: Configuração + Cardápio */}
          <div className="lg:col-span-2 space-y-5">
            <Card>
              <CardContent className="p-5 space-y-5 sm:p-6">
                {/* Tipo de pedido */}
                <div>
                  <Label className="mb-2 block text-sm font-medium">
                    Tipo de Pedido
                  </Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {ORDER_TYPES.map((t) => (
                      <Button
                        key={t.value}
                        variant={orderType === t.value ? "default" : "outline"}
                        onClick={() => {
                          setOrderType(t.value);
                          if (t.value !== "table") setTableId("");
                        }}
                        className="w-full text-sm"
                        data-testid={`button-type-${t.value}`}
                      >
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Mesa */}
                {orderType === "table" && (
                  <div>
                    <Label>Mesa *</Label>
                    <Select
                      value={tableId || "none"}
                      onValueChange={(v) => setTableId(v === "none" ? "" : v)}
                    >
                      <SelectTrigger data-testid="select-table">
                        <SelectValue placeholder="Selecionar mesa disponível" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecionar mesa</SelectItem>
                        {tables
                          ?.filter((t) => t.status === "available")
                          .map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              Mesa {t.number} · {t.capacity} lugares
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Identificação opcional para pedidos não delivery */}
                {orderType !== "delivery" && (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                    <div>
                      <Label>Nome do cliente (opcional)</Label>
                      <Input
                        placeholder={
                          orderType === "table"
                            ? "Ex: João / aniversariante"
                            : "Ex: Maria"
                        }
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        data-testid="input-customer-name"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Identifica a comanda sem criar cadastro quando não
                        houver telefone.
                      </p>
                    </div>
                  </div>
                )}

                {/* Campos de Delivery */}
                {orderType === "delivery" && (
                  <div className="space-y-3 border rounded-lg p-4 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/60">
                    <div className="flex items-center gap-2 text-[#D91F16] dark:text-red-300 font-semibold text-sm">
                      <Truck className="w-4 h-4" />
                      Dados de Entrega
                    </div>

                    {/* Nome + Telefone */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Nome do Cliente *</Label>
                        <Input
                          placeholder="Nome completo"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          data-testid="input-customer-name"
                        />
                      </div>
                      <div>
                        <Label>Telefone *</Label>
                        <Input
                          placeholder="(11) 99999-9999"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          data-testid="input-customer-phone"
                        />
                      </div>
                    </div>

                    {/* CEP + Taxa */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label>CEP</Label>
                        <Input
                          placeholder="00000-000"
                          value={deliveryCep}
                          onChange={(e) => {
                            setDeliveryCep(e.target.value);
                            setFeeAutoCalculated(false);
                            setFeeCalcInfo(null);
                          }}
                          data-testid="input-delivery-cep"
                          maxLength={9}
                        />
                      </div>
                      <div>
                        <Label className="flex items-center justify-between">
                          <span>Taxa de Entrega (R$)</span>
                          {feeAutoCalculated && (
                            <span className="text-xs font-normal text-green-600 dark:text-green-400">
                              📍 automática
                            </span>
                          )}
                        </Label>
                        <Input
                          type="number"
                          step="0.50"
                          min="0"
                          placeholder="0,00"
                          value={deliveryFee}
                          onChange={(e) => {
                            setDeliveryFee(e.target.value);
                            setFeeAutoCalculated(false);
                            setFeeCalcInfo(null);
                          }}
                          data-testid="input-delivery-fee"
                        />
                      </div>
                    </div>

                    {/* Aviso / detalhes do cálculo automático */}
                    {(storeSettings?.deliveryFeeMode === "per_km" ||
                      storeSettings?.deliveryFeeMode === "distance_tier") && (
                      <>
                        {!storeSettings.storeCep && (
                          <p className="text-xs text-[#D91F16] dark:text-red-300 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 rounded px-3 py-2">
                            ⚠️ Configure o CEP da loja em Configurações para
                            calcular a taxa automaticamente.
                          </p>
                        )}
                        {storeSettings.storeCep &&
                          deliveryCep.replace(/\D/g, "").length > 0 &&
                          deliveryCep.replace(/\D/g, "").length < 8 && (
                            <p className="text-xs text-muted-foreground">
                              Digite os 8 dígitos do CEP para calcular
                              automaticamente.
                            </p>
                          )}
                        {cepLookupStatus === "loading" &&
                          distanceCalcStatus !== "loading" && (
                            <p className="text-xs text-muted-foreground animate-pulse">
                              Buscando endereço pelo CEP...
                            </p>
                          )}
                        {distanceCalcStatus === "loading" && (
                          <p className="text-xs text-muted-foreground animate-pulse">
                            Calculando distância...
                          </p>
                        )}
                        {cepLookupStatus === "not_found" && (
                          <p className="text-xs text-red-500">
                            CEP não encontrado no ViaCEP. Preencha o endereço
                            manualmente.
                          </p>
                        )}
                        {distanceCalcStatus === "error" && (
                          <p className="text-xs text-[#D91F16] dark:text-red-300">
                            Não foi possível calcular a distância. Verifique o
                            CEP ou preencha a taxa manualmente.
                          </p>
                        )}
                        {feeCalcInfo && (
                          <div className="text-xs bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded px-3 py-2 space-y-1 text-green-800 dark:text-green-300">
                            <div className="flex justify-between">
                              <span className="text-green-600 dark:text-green-400">
                                CEP da loja
                              </span>
                              <span className="font-mono font-semibold">
                                {feeCalcInfo.storeCep.replace(
                                  /^(\d{5})(\d{3})$/,
                                  "$1-$2",
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-green-600 dark:text-green-400">
                                CEP do cliente
                              </span>
                              <span className="font-mono font-semibold">
                                {deliveryCep
                                  .replace(/\D/g, "")
                                  .replace(/^(\d{5})(\d{3})$/, "$1-$2")}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-green-600 dark:text-green-400">
                                Distância
                              </span>
                              <span className="font-semibold">
                                {feeCalcInfo.distanceKm} km
                              </span>
                            </div>
                            <div className="flex justify-between border-t border-green-200 dark:border-green-700 pt-1 mt-0.5">
                              <span className="font-semibold text-green-700 dark:text-green-200">
                                Taxa calculada
                              </span>
                              <span className="font-black text-green-700 dark:text-green-200">
                                R$ {feeCalcInfo.fee.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Endereço */}
                    <div>
                      <Label>Endereço Completo *</Label>
                      <Input
                        placeholder="Rua, número"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        data-testid="input-delivery-address"
                      />
                    </div>

                    {/* Bairro + Complemento */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Bairro *</Label>
                        <Input
                          placeholder="Bairro"
                          value={deliveryNeighborhood}
                          onChange={(e) =>
                            setDeliveryNeighborhood(e.target.value)
                          }
                          data-testid="input-delivery-neighborhood"
                        />
                      </div>
                      <div>
                        <Label>Complemento / Referência</Label>
                        <Input
                          placeholder="Apto, ponto de referência..."
                          value={deliveryReference}
                          onChange={(e) => setDeliveryReference(e.target.value)}
                          data-testid="input-delivery-reference"
                        />
                      </div>
                    </div>

                    {/* Observação entrega */}
                    <div>
                      <Label>Observação da Entrega</Label>
                      <Textarea
                        placeholder="Ex: ligar ao chegar, portão verde..."
                        value={deliveryNotes}
                        onChange={(e) => setDeliveryNotes(e.target.value)}
                        rows={2}
                        data-testid="input-delivery-notes"
                      />
                    </div>

                    {/* Pagamento */}
                    <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 space-y-3">
                      <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Banknote className="w-4 h-4" /> Pagamento
                      </p>
                      {/* Quando pagar */}
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { value: "now", label: "💳 Pagou agora" },
                          {
                            value: "on_delivery",
                            label: "💰 Pagar na entrega",
                          },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              setPaymentTiming(
                                opt.value as "now" | "on_delivery",
                              )
                            }
                            className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                              paymentTiming === opt.value
                                ? "bg-[#FF2A1F] text-white border-[#FF2A1F]"
                                : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 hover:border-[#FF2A1F]"
                            }`}
                            data-testid={`button-payment-timing-${opt.value}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {/* Forma de pagamento (apenas se pagar na entrega) */}
                      {paymentTiming === "on_delivery" && (
                        <div className="space-y-4 pb-6">
                          <div>
                            <Label>Forma de pagamento</Label>
                            <div className="grid grid-cols-1 gap-2 mt-1 sm:grid-cols-3">
                              {[
                                {
                                  value: "dinheiro",
                                  label: "Dinheiro",
                                  Icon: Banknote,
                                },
                                {
                                  value: "pix",
                                  label: "Pix",
                                  Icon: Smartphone,
                                },
                                {
                                  value: "cartao",
                                  label: "Cartão",
                                  Icon: CreditCard,
                                },
                              ].map(({ value, label, Icon }) => (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() =>
                                    setDeliveryPaymentMethod(
                                      value as "dinheiro" | "pix" | "cartao",
                                    )
                                  }
                                  className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
                                    deliveryPaymentMethod === value
                                      ? "bg-[#FF2A1F] text-white border-[#FF2A1F]"
                                      : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 hover:border-[#FF2A1F]"
                                  }`}
                                  data-testid={`button-payment-method-${value}`}
                                >
                                  <Icon className="w-4 h-4" />
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Troco (apenas dinheiro) */}
                          {deliveryPaymentMethod === "dinheiro" && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                <Label>Precisa de troco?</Label>
                                <div className="flex gap-2">
                                  {[
                                    { value: true, label: "Sim" },
                                    { value: false, label: "Não" },
                                  ].map((opt) => (
                                    <button
                                      key={String(opt.value)}
                                      type="button"
                                      onClick={() => setNeedsChange(opt.value)}
                                      className={`px-3 py-1 rounded border text-xs font-medium transition-colors ${
                                        needsChange === opt.value
                                          ? "bg-[#FF2A1F] text-white border-[#FF2A1F]"
                                          : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700"
                                      }`}
                                      data-testid={`button-needs-change-${opt.value}`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {needsChange && (
                                <div>
                                  <Label>Troco para quanto?</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="Ex: 50,00"
                                    value={changeFor}
                                    onChange={(e) =>
                                      setChangeFor(e.target.value)
                                    }
                                    data-testid="input-change-for"
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          <div>
                            <Label>Obs. de pagamento (opcional)</Label>
                            <Input
                              placeholder="Ex: tem troco de 10, paga em débito..."
                              value={deliveryPaymentNotes}
                              onChange={(e) =>
                                setDeliveryPaymentNotes(e.target.value)
                              }
                              data-testid="input-delivery-payment-notes"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Campos de Takeaway (nome/tel opcionais) */}
                {orderType === "takeaway" && (
                  <div className="space-y-3 border rounded-lg p-4 bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
                    <div className="text-blue-700 dark:text-blue-400 font-semibold text-sm">
                      🛵 Dados para Retirada (opcional)
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Nome (opcional)</Label>
                        <Input
                          placeholder="Nome do cliente"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          data-testid="input-takeaway-name"
                        />
                      </div>
                      <div>
                        <Label>Telefone (opcional)</Label>
                        <Input
                          placeholder="(11) 99999-9999"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          data-testid="input-takeaway-phone"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Cliente registrado / auto-salvamento */}
                {canUseCustomerDirectory ? (
                  <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Label>
                          {orderType === "delivery" || orderType === "takeaway"
                            ? "Cliente cadastrado (opcional)"
                            : "Cliente (opcional)"}
                        </Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selectedCustomer
                            ? `Pedido vinculado a ${selectedCustomer.name}${selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ""}.`
                            : "Selecione um cliente existente ou deixe sem cliente identificado quando permitido."}
                        </p>
                      </div>
                      <Save className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <Select
                      value={customerId || "none"}
                      onValueChange={selectCustomer}
                    >
                      <SelectTrigger data-testid="select-customer">
                        <SelectValue placeholder="Selecionar cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          Sem cliente identificado
                        </SelectItem>
                        {customerOptions?.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                            {c.phone ? ` · ${c.phone}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {!customerId && customerFormHasData && (
                      <button
                        type="button"
                        onClick={() => setAutoSaveCustomer((value) => !value)}
                        className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
                          autoSaveCustomer
                            ? "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200"
                            : "border-border bg-background text-muted-foreground"
                        }`}
                        data-testid="button-auto-save-customer"
                      >
                        <span
                          className={`mt-0.5 h-4 w-4 rounded border ${autoSaveCustomer ? "border-green-600 bg-green-600" : "border-muted-foreground"}`}
                        />
                        <span>
                          <span className="block font-medium">
                            Salvar cliente automaticamente
                          </span>
                          <span className="block text-xs opacity-80">
                            {canAutoSaveCustomer
                              ? "Ao confirmar, o sistema busca pelo telefone nesta loja, atualiza o cadastro encontrado ou cria um novo cliente."
                              : "Informe nome e telefone para salvar automaticamente; caso contrário o pedido segue sem cliente identificado quando permitido."}
                          </span>
                        </span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                    Cliente cadastrado fica desativado para atendente nesta V1;
                    o pedido ainda usa nome e telefone informados no
                    delivery/retirada.
                  </div>
                )}

                {/* Observação geral */}
                <div>
                  <Label>Observações do Pedido (opcional)</Label>
                  <Textarea
                    placeholder="Ex: sem cebola, alergia a amendoim..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    rows={2}
                    data-testid="input-order-notes"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Cardápio */}
            <div className="space-y-4 pb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produto..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-product"
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant={categoryFilter === "all" ? "default" : "outline"}
                  onClick={() => setCategoryFilter("all")}
                >
                  Todos
                </Button>
                {categories?.map((cat) => (
                  <Button
                    key={cat.id}
                    size="sm"
                    variant={
                      categoryFilter === String(cat.id) ? "default" : "outline"
                    }
                    onClick={() => setCategoryFilter(String(cat.id))}
                    data-testid={`filter-cat-${cat.id}`}
                  >
                    {cat.name}
                  </Button>
                ))}
              </div>

              {loadingProducts ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 pb-4 sm:grid-cols-2 md:grid-cols-3">
                  {products
                    ?.filter((p) => p.available)
                    .map((product) => {
                      const inCart = cart.find(
                        (i) => i.productId === product.id,
                      );
                      return (
                        <Card
                          key={product.id}
                          className={`cursor-pointer select-none rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-md ${inCart ? "ring-2 ring-primary bg-primary/5" : ""}`}
                          onClick={() => void handleProductClick(product)}
                          data-testid={`card-product-${product.id}`}
                        >
                          <CardContent className="flex min-h-24 flex-col justify-between p-4">
                            <p className="font-medium text-sm line-clamp-2 mb-3 leading-snug">
                              {product.name}
                            </p>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-primary font-bold text-sm">
                                R$ {product.price.toFixed(2)}
                              </span>
                              {inCart ? (
                                <Badge className="text-xs">
                                  {inCart.quantity}x
                                </Badge>
                              ) : (
                                <Plus className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  {products?.filter((p) => p.available).length === 0 && (
                    <div className="col-span-3 text-center py-8 text-muted-foreground text-sm">
                      Nenhum produto encontrado
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Direita: Carrinho */}
          <div className="lg:col-span-1">
            <Card className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
              <CardContent className="flex max-h-[inherit] flex-col p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <ShoppingCart className="w-5 h-5 text-primary" />
                  <h2 className="font-semibold text-lg">Resumo do Pedido</h2>
                  {cartCount > 0 && <Badge>{cartCount}</Badge>}
                </div>

                {cart.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">
                      Clique nos produtos para adicionar
                    </p>
                  </div>
                ) : (
                  <div className="mb-4 max-h-[45vh] space-y-4 overflow-y-auto pr-1 lg:max-h-[calc(100vh-22rem)]">
                    {cart.map((item) => (
                      <div
                        key={`${item.productId}-${item.variantId ?? "base"}-${item.addonKey}`}
                        data-testid={`cart-item-${item.productId}-${item.variantId ?? "base"}`}
                        className="border-b pb-3 last:border-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {item.name}
                              {item.variantName ? ` — ${item.variantName}` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.quantity}x R$ {item.price.toFixed(2)} ={" "}
                              <span className="font-semibold text-foreground">
                                R$ {(item.price * item.quantity).toFixed(2)}
                              </span>
                            </p>
                            {item.addons.length > 0 && (
                              <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                                {item.addons.map((addon) => (
                                  <p key={addon.addonOptionId}>↳ {addon.name} · R$ {addon.price.toFixed(2)}</p>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0"
                              onClick={() =>
                                removeFromCart(item.productId, item.variantId, item.addonKey)
                              }
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="text-sm font-bold w-6 text-center">
                              {item.quantity}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0"
                              onClick={() =>
                                addToCart(
                                  {
                                    id: item.productId,
                                    name: item.name,
                                    price: item.price,
                                  },
                                  item.variantId != null
                                    ? {
                                        id: item.variantId,
                                        name: item.variantName ?? "",
                                        price: item.price - item.addons.reduce((sum, addon) => sum + addon.price * addon.quantity, 0),
                                      }
                                    : undefined,
                                  item.addons,
                                )
                              }
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-muted-foreground shrink-0" />
                          <Input
                            placeholder="Observação (ex: sem sal)"
                            value={item.notes}
                            onChange={(e) =>
                              updateItemNotes(
                                item.productId,
                                item.variantId,
                                item.addonKey,
                                e.target.value,
                              )
                            }
                            className="h-6 text-xs px-2 py-0"
                            data-testid={`cart-item-notes-${item.productId}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Totais */}
                {cart.length > 0 && (
                  <div className="border-t pt-3 mb-4 space-y-1.5">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Subtotal dos itens</span>
                      <span>R$ {cartSubtotal.toFixed(2)}</span>
                    </div>
                    {orderType === "delivery" && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Taxa de entrega</span>
                        <span
                          className={
                            parsedFee > 0
                              ? "text-[#D91F16] dark:text-red-300 font-medium"
                              : ""
                          }
                        >
                          {parsedFee > 0 ? `R$ ${parsedFee.toFixed(2)}` : "—"}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-xl border-t pt-1.5 mt-1">
                      <span>Total</span>
                      <span className="text-primary">
                        R$ {cartTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleCreate}
                  disabled={creating || cart.length === 0}
                  data-testid="button-create-order"
                >
                  {creating
                    ? "Criando pedido..."
                    : cart.length === 0
                      ? "Adicione itens"
                      : `Confirmar Pedido · R$ ${cartTotal.toFixed(2)}`}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={addonModalOpen} onOpenChange={setAddonModalOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-6 py-5 pr-12">
            <DialogTitle className="text-xl">
              Escolha adicionais{addonProduct ? ` · ${addonProduct.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {addonGroups.map((group) => {
              const selectedCount = selectedAddonList.filter((addon) => addon.groupId === group.id).length;
              return (
                <div key={group.id} className="rounded-xl border p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{group.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {group.required ? "Obrigatório" : "Opcional"} · mín. {group.required ? Math.max(1, group.minSelected) : group.minSelected}
                        {group.maxSelected != null ? ` · máx. ${group.maxSelected}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline">{selectedCount} selecionado(s)</Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {group.options.map((option) => {
                      const selected = Boolean(selectedAddons[option.id]);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={!option.available}
                          className={`rounded-lg border p-3 text-left transition ${selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/60"} ${!option.available ? "cursor-not-allowed opacity-50" : ""}`}
                          onClick={() => toggleAddon(group, option)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">{option.name}</span>
                            <span className="font-semibold text-primary">R$ {option.price.toFixed(2)}</span>
                          </div>
                          {!option.available && <p className="text-xs text-muted-foreground">Indisponível</p>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter className="gap-2 border-t bg-background px-6 py-4 sm:justify-between sm:space-x-0">
            <div className="text-sm">
              {addonValidationError && <p className="text-destructive">{addonValidationError}</p>}
              <p className="font-semibold">Total do item: R$ {addonTotal.toFixed(2)}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setAddonModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                disabled={Boolean(addonValidationError) || !addonProduct}
                onClick={() => {
                  if (!addonProduct || addonValidationError) return;
                  addToCart(addonProduct, addonProduct.variant, selectedAddonList);
                  setAddonModalOpen(false);
                }}
              >
                Adicionar ao pedido
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={variantModalOpen} onOpenChange={setVariantModalOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-6 py-5 pr-12">
            <DialogTitle className="text-xl">
              Escolha a variação
              {variantProduct ? ` · ${variantProduct.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {variantOptions.map((v) => {
                const selected = selectedVariantId === v.id;

                return (
                  <button
                    key={v.id}
                    type="button"
                    className={`min-h-28 rounded-xl border p-4 text-left transition hover:border-primary/60 hover:bg-primary/5 ${selected ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/30" : "border-border bg-card"}`}
                    onClick={() => setSelectedVariantId(v.id)}
                  >
                    <div className="flex h-full flex-col justify-between gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-base font-semibold leading-snug text-foreground">
                          {v.name}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                        >
                          {selected ? "Selecionada" : "Opção"}
                        </span>
                      </div>
                      <span className="text-2xl font-bold text-primary">
                        R$ {v.price.toFixed(2)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter className="gap-2 border-t bg-background px-6 py-4 sm:justify-between sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setVariantModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={selectedVariantId == null || !variantProduct}
              onClick={() => {
                const variant = variantOptions.find(
                  (v) => v.id === selectedVariantId,
                );
                if (!variant || !variantProduct) return;
                setVariantModalOpen(false);
                void openAddonStep(variantProduct, variant);
              }}
            >
              Adicionar ao pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
