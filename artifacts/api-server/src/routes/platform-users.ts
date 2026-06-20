import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requirePlatformRole } from "../middleware/platform-rbac";

const router: IRouter = Router();

const canReadPlatformUsers = requirePlatformRole(
  "platform_owner",
  "platform_admin",
  "platform_support",
);

type RawPlatformUserRow = {
  id: number;
  name: string;
  email: string;
  status: string;
  created_at: Date | string;
  last_login_at: Date | string | null;
  platform_role: string | null;
  platform_admin_status: string | null;
  entitlement_status: string | null;
  entitlement_plan: string | null;
  active_stores_count: number | string | null;
  total_stores_count: number | string | null;
  critical_cash_links: number | string | null;
  stores: unknown;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseStores(value: unknown) {
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

function buildBlockReason(input: {
  platformRole: string | null;
  activeStoresCount: number;
  criticalCashLinks: number;
}) {
  if (["platform_owner", "platform_admin"].includes(input.platformRole ?? "")) {
    return "usuário protegido da plataforma";
  }
  if (input.activeStoresCount > 0) return "possui loja ativa";
  if (input.criticalCashLinks > 0) return "possui vínculo crítico com caixa";
  return "deletável";
}

router.get("/platform/users", canReadPlatformUsers, async (_req, res) => {
  const result = await db.execute(sql`
    with memberships as (
      select
        sm.user_id,
        count(sm.id)::int as total_stores_count,
        count(sm.id) filter (where sm.active = true)::int as active_stores_count,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'memberId', sm.id,
              'storeId', s.id,
              'storeName', s.name,
              'storeSlug', s.slug,
              'storeStatus', s.status,
              'role', sm.role,
              'active', sm.active,
              'isDefault', sm.is_default
            )
            order by sm.active desc, sm.is_default desc, s.name asc
          ) filter (where sm.id is not null),
          '[]'::jsonb
        ) as stores
      from store_members sm
      inner join stores s on s.id = sm.store_id
      group by sm.user_id
    ),
    cash_links as (
      select
        operator_user_id as user_id,
        count(*)::int as critical_cash_links
      from cash_registers
      where operator_user_id is not null
      group by operator_user_id
    )
    select
      u.id,
      u.name,
      u.email,
      u.status,
      u.created_at,
      u.last_login_at,
      pa.role as platform_role,
      pa.status as platform_admin_status,
      ue.status as entitlement_status,
      ue.plan as entitlement_plan,
      coalesce(m.active_stores_count, 0) as active_stores_count,
      coalesce(m.total_stores_count, 0) as total_stores_count,
      coalesce(cl.critical_cash_links, 0) as critical_cash_links,
      coalesce(m.stores, '[]'::jsonb) as stores
    from users u
    left join memberships m on m.user_id = u.id
    left join platform_admins pa on pa.user_id = u.id
    left join user_entitlements ue on ue.user_id = u.id
    left join cash_links cl on cl.user_id = u.id
    order by u.created_at desc, u.id desc
  `);

  const users = (result.rows as RawPlatformUserRow[]).map((row) => {
    const platformRole = row.platform_role ?? null;
    const activeStoresCount = Number(row.active_stores_count ?? 0);
    const totalStoresCount = Number(row.total_stores_count ?? 0);
    const criticalCashLinks = Number(row.critical_cash_links ?? 0);
    const blockReason = buildBlockReason({
      platformRole,
      activeStoresCount,
      criticalCashLinks,
    });

    return {
      id: Number(row.id),
      name: row.name,
      email: row.email,
      status: row.status,
      createdAt: toIso(row.created_at),
      lastLoginAt: toIso(row.last_login_at),
      platformRole,
      platformAdminStatus: row.platform_admin_status ?? null,
      entitlementStatus: row.entitlement_status ?? null,
      entitlementPlan: row.entitlement_plan ?? null,
      stores: parseStores(row.stores),
      activeStoresCount,
      totalStoresCount,
      isProtected: ["platform_owner", "platform_admin"].includes(
        platformRole ?? "",
      ),
      canDelete: blockReason === "deletável",
      blockReason,
    };
  });

  res.json({ users });
});

export default router;
