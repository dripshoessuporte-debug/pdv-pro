import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requirePlatformRole } from "../middleware/platform-rbac";

const router: IRouter = Router();

const canReadStores = requirePlatformRole(
  "platform_owner",
  "platform_admin",
  "platform_support",
);

type RawStoreDetailsRow = Record<string, unknown>;

function toIso(value: unknown) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function parseJsonArray(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function yesNo(ok: boolean) {
  return ok ? "ok" : "attention";
}

router.get("/platform/stores/:storeId", canReadStores, async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!Number.isInteger(storeId) || storeId <= 0) {
    res.status(400).json({ error: "Loja inválida." });
    return;
  }

  const storeResult = await db.execute(sql`
    select id, name, slug, status, created_at
    from stores
    where id = ${storeId}
    limit 1
  `);
  const store = storeResult.rows[0] as RawStoreDetailsRow | undefined;
  if (!store) {
    res.status(404).json({ error: "Loja não encontrada." });
    return;
  }

  const membersResult = await db.execute(sql`
    select
      sm.id,
      u.id as user_id,
      u.name,
      u.email,
      sm.role,
      sm.active,
      sm.is_default,
      u.status as user_status,
      ue.plan as entitlement_plan,
      ue.status as entitlement_status
    from store_members sm
    inner join users u on u.id = sm.user_id
    left join user_entitlements ue on ue.user_id = u.id
    where sm.store_id = ${storeId}
    order by sm.active desc, sm.role asc, u.name asc
  `);

  const members = (membersResult.rows as RawStoreDetailsRow[]).map((member) => ({
    id: Number(member.id),
    userId: Number(member.user_id),
    name: String(member.name ?? ""),
    email: String(member.email ?? ""),
    role: String(member.role ?? ""),
    active: Boolean(member.active),
    isDefault: Boolean(member.is_default),
    userStatus: String(member.user_status ?? ""),
    entitlementPlan: member.entitlement_plan ? String(member.entitlement_plan) : null,
    entitlementStatus: member.entitlement_status ? String(member.entitlement_status) : null,
  }));

  const totalsResult = await db.execute(sql`
    select
      count(id)::int as today_orders,
      coalesce(sum(total_amount), 0)::numeric as today_revenue
    from orders
    where store_id = ${storeId}
      and date(created_at) = current_date
  `);
  const totals = totalsResult.rows[0] as RawStoreDetailsRow | undefined;

  const openCashResult = await db.execute(sql`
    select
      id,
      operator_user_id,
      operator,
      opening_amount,
      opened_at
    from cash_registers
    where store_id = ${storeId}
      and status = 'open'
    order by opened_at desc
    limit 1
  `);
  const openCash = openCashResult.rows[0] as RawStoreDetailsRow | undefined;

  const lastCashResult = await db.execute(sql`
    select
      id,
      operator,
      status,
      opened_at,
      closed_at,
      closing_amount
    from cash_registers
    where store_id = ${storeId}
    order by opened_at desc
    limit 1
  `);
  const lastCash = lastCashResult.rows[0] as RawStoreDetailsRow | undefined;

  const menuResult = await db.execute(sql`
    select count(id)::int as total
    from menu_items
    where store_id = ${storeId}
  `).catch(() => ({ rows: [{ total: 0 }] }));

  const activeMembers = members.filter((member) => member.active);
  const maxControls = activeMembers.filter((member) => member.role === "max_control");
  const roleCounts = activeMembers.reduce<Record<string, number>>((acc, member) => {
    acc[member.role] = (acc[member.role] ?? 0) + 1;
    return acc;
  }, {});
  const ownerCandidate = maxControls.find((member) => member.isDefault) ?? maxControls[0] ?? activeMembers[0] ?? null;
  const entitlementSource = ownerCandidate ?? activeMembers.find((member) => member.entitlementStatus) ?? null;
  const menuItemsCount = toNumber((menuResult.rows[0] as RawStoreDetailsRow | undefined)?.total);
  const todayOrders = toNumber(totals?.today_orders);
  const todayRevenue = toNumber(totals?.today_revenue);

  const healthChecks = [
    {
      key: "max_control",
      label: "Responsável Max Control",
      status: yesNo(maxControls.length > 0),
      message: maxControls.length > 0 ? `${maxControls.length} responsável(is) ativo(s)` : "Nenhum Max Control ativo nesta loja",
    },
    {
      key: "active_members",
      label: "Equipe ativa",
      status: yesNo(activeMembers.length > 0),
      message: activeMembers.length > 0 ? `${activeMembers.length} membro(s) ativo(s)` : "Nenhum membro ativo vinculado",
    },
    {
      key: "menu",
      label: "Cardápio",
      status: yesNo(menuItemsCount > 0),
      message: menuItemsCount > 0 ? `${menuItemsCount} item(ns) cadastrados` : "Nenhum item de cardápio encontrado",
    },
    {
      key: "cash",
      label: "Caixa",
      status: openCash ? "ok" : "neutral",
      message: openCash ? `Caixa #${openCash.id} aberto por ${openCash.operator}` : "Nenhum caixa aberto agora",
    },
  ];

  res.json({
    store: {
      id: Number(store.id),
      name: String(store.name ?? ""),
      slug: String(store.slug ?? ""),
      status: String(store.status ?? ""),
      createdAt: toIso(store.created_at),
      membersCount: members.length,
      activeMembersCount: activeMembers.length,
    },
    members,
    maxControlUsers: maxControls,
    membersByRole: roleCounts,
    entitlement: entitlementSource
      ? {
          plan: entitlementSource.entitlementPlan,
          status: entitlementSource.entitlementStatus,
          userId: entitlementSource.userId,
          userName: entitlementSource.name,
          userEmail: entitlementSource.email,
        }
      : null,
    activeCashRegister: openCash
      ? {
          id: Number(openCash.id),
          operatorUserId: openCash.operator_user_id ? Number(openCash.operator_user_id) : null,
          operator: String(openCash.operator ?? ""),
          openingAmount: toNumber(openCash.opening_amount),
          openedAt: toIso(openCash.opened_at),
        }
      : null,
    lastCashRegister: lastCash
      ? {
          id: Number(lastCash.id),
          operator: String(lastCash.operator ?? ""),
          status: String(lastCash.status ?? ""),
          openedAt: toIso(lastCash.opened_at),
          closedAt: toIso(lastCash.closed_at),
          closingAmount: lastCash.closing_amount === null ? null : toNumber(lastCash.closing_amount),
        }
      : null,
    today: {
      orders: todayOrders,
      revenue: todayRevenue,
      openCashRegister: Boolean(openCash),
    },
    todayOrders,
    todayRevenue,
    operationalHealth: {
      checks: healthChecks,
      attentionCount: healthChecks.filter((check) => check.status === "attention").length,
    },
  });
});

export default router;
