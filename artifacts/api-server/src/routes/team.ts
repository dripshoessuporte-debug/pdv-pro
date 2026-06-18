import { Router, type IRouter } from "express";
import { and, count, desc, eq, sql } from "drizzle-orm";
import {
  cashRegistersTable,
  db,
  storeMembersTable,
  storesTable,
  usersTable,
} from "@workspace/db";
import {
  getCurrentActor,
  requireRole,
  roles,
  type ActorRole,
} from "../middleware/rbac";
import { hashPassword, isValidEmail, normalizeEmail } from "../lib/auth";

const router: IRouter = Router();
const teamRoles = new Set<string>(roles);
const minimumPasswordLength = 6;

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseRole(value: unknown): ActorRole | null {
  const role = trim(value);
  return teamRoles.has(role) ? (role as ActorRole) : null;
}

async function findMemberInStore(memberId: number, storeId: number) {
  const [member] = await db
    .select({
      memberId: storeMembersTable.id,
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: storeMembersTable.role,
      active: storeMembersTable.active,
      createdAt: storeMembersTable.createdAt,
      isDefault: storeMembersTable.isDefault,
      storeId: storeMembersTable.storeId,
      storeName: storesTable.name,
      lastLoginAt: usersTable.lastLoginAt,
    })
    .from(storeMembersTable)
    .innerJoin(usersTable, eq(storeMembersTable.userId, usersTable.id))
    .innerJoin(storesTable, eq(storeMembersTable.storeId, storesTable.id))
    .where(
      and(
        eq(storeMembersTable.id, memberId),
        eq(storeMembersTable.storeId, storeId),
      ),
    )
    .limit(1);

  return member ?? null;
}

async function countActiveMaxControls(storeId: number): Promise<number> {
  const [result] = await db
    .select({ total: count() })
    .from(storeMembersTable)
    .where(
      and(
        eq(storeMembersTable.storeId, storeId),
        eq(storeMembersTable.role, "max_control"),
        eq(storeMembersTable.active, true),
      ),
    );
  return result?.total ?? 0;
}

async function wouldRemoveLastActiveMaxControl(
  memberId: number,
  storeId: number,
  nextRole?: ActorRole,
  nextActive?: boolean,
) {
  const member = await findMemberInStore(memberId, storeId);
  if (!member) return { member: null, blocked: false };
  const isActiveMax = member.role === "max_control" && member.active;
  const remainsActiveMax =
    (nextRole ?? (member.role as ActorRole)) === "max_control" &&
    (nextActive ?? member.active);
  if (!isActiveMax || remainsActiveMax) return { member, blocked: false };
  return { member, blocked: (await countActiveMaxControls(storeId)) <= 1 };
}

router.get("/team/context-diagnostics", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  const memberships = await db
    .select({
      storeMemberId: storeMembersTable.id,
      storeId: storeMembersTable.storeId,
      storeName: storesTable.name,
      role: storeMembersTable.role,
      active: storeMembersTable.active,
      isDefault: storeMembersTable.isDefault,
    })
    .from(storeMembersTable)
    .innerJoin(storesTable, eq(storeMembersTable.storeId, storesTable.id))
    .where(eq(storeMembersTable.userId, actor.id ?? 0))
    .orderBy(sql`${storeMembersTable.isDefault} DESC`, storesTable.id);

  const membership =
    memberships.find((member) => member.storeId === actor.storeId) ?? null;
  const [openCash] = await db
    .select({
      id: cashRegistersTable.id,
      openedByUserId: cashRegistersTable.operatorUserId,
      openedByName: cashRegistersTable.operator,
    })
    .from(cashRegistersTable)
    .where(
      and(
        eq(cashRegistersTable.storeId, actor.storeId),
        eq(cashRegistersTable.status, "open"),
      ),
    )
    .orderBy(desc(cashRegistersTable.openedAt))
    .limit(1);
  const actorCanAccessCash = ["max_control", "atendente"].includes(actor.role);
  const warnings: string[] = [];
  if (!membership)
    warnings.push("Usuário sem store_member ativo para a loja atual.");
  if (!memberships.length) warnings.push("Usuário sem loja ativa vinculada.");
  if (openCash && !actorCanAccessCash)
    warnings.push(
      "Existe caixa aberto na loja, mas o perfil atual não acessa caixa.",
    );

  res.json({
    user: { id: actor.id, name: actor.name, email: actor.email ?? null },
    currentStore: {
      id: actor.storeId,
      name: membership?.storeName ?? `Loja ${actor.storeId}`,
      role: actor.role,
    },
    stores: memberships.map((member) => ({
      id: member.storeId,
      name: member.storeName,
      role: member.role,
    })),
    membership: membership
      ? {
          storeMemberId: membership.storeMemberId,
          role: membership.role,
          active: membership.active,
          isDefault: membership.isDefault,
        }
      : null,
    cash: {
      storeHasOpenCashRegister: Boolean(openCash),
      openCashRegisterId: openCash?.id ?? null,
      openedByUserId: openCash?.openedByUserId ?? null,
      openedByName: openCash?.openedByName ?? null,
      actorCanAccessCash,
    },
    warnings,
  });
});

router.use("/team", requireRole("max_control"));

router.get("/team", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  const members = await db
    .select({
      memberId: storeMembersTable.id,
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: storeMembersTable.role,
      active: storeMembersTable.active,
      createdAt: storeMembersTable.createdAt,
      storeId: storeMembersTable.storeId,
      storeName: storesTable.name,
      lastLoginAt: usersTable.lastLoginAt,
    })
    .from(storeMembersTable)
    .innerJoin(usersTable, eq(storeMembersTable.userId, usersTable.id))
    .innerJoin(storesTable, eq(storeMembersTable.storeId, storesTable.id))
    .where(eq(storeMembersTable.storeId, actor.storeId))
    .orderBy(storeMembersTable.createdAt);

  res.json(
    members.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      lastLoginAt: m.lastLoginAt?.toISOString() ?? null,
    })),
  );
});

router.post("/team", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  const name = trim(req.body?.name);
  const email = normalizeEmail(trim(req.body?.email));
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  const role = parseRole(req.body?.role);

  if (!name) {
    res.status(400).json({ error: "Informe o nome completo." });
    return;
  }
  if (!email || !isValidEmail(email)) {
    res.status(400).json({ error: "Informe um e-mail válido." });
    return;
  }
  if (password.length < minimumPasswordLength) {
    res.status(400).json({
      error: `A senha deve ter pelo menos ${minimumPasswordLength} caracteres.`,
    });
    return;
  }
  if (!role) {
    res.status(400).json({ error: "Informe uma função válida." });
    return;
  }

  const [existingUser] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`)
    .limit(1);
  let userId = existingUser?.id;
  if (userId) {
    const [existingMember] = await db
      .select({ id: storeMembersTable.id })
      .from(storeMembersTable)
      .where(
        and(
          eq(storeMembersTable.storeId, actor.storeId),
          eq(storeMembersTable.userId, userId),
        ),
      )
      .limit(1);
    if (existingMember) {
      await db
        .update(storeMembersTable)
        .set({ role, active: true })
        .where(eq(storeMembersTable.id, existingMember.id));
      res.status(200).json({ memberId: existingMember.id, updated: true });
      return;
    }
  } else {
    const [createdUser] = await db
      .insert(usersTable)
      .values({
        name,
        email,
        passwordHash: hashPassword(password),
        status: "active",
      })
      .returning({ id: usersTable.id });
    userId = createdUser.id;
  }

  const [defaultCount] = await db
    .select({ total: count() })
    .from(storeMembersTable)
    .where(
      and(
        eq(storeMembersTable.userId, userId),
        eq(storeMembersTable.isDefault, true),
      ),
    );

  const [createdMember] = await db
    .insert(storeMembersTable)
    .values({
      storeId: actor.storeId,
      userId,
      role,
      active: true,
      isDefault: Number(defaultCount?.total ?? 0) === 0,
    })
    .returning({ memberId: storeMembersTable.id });
  res.status(201).json({ memberId: createdMember.memberId });
});

router.patch("/team/:memberId", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  const memberId = Number(req.params.memberId);
  const role = parseRole(req.body?.role);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    res.status(400).json({ error: "Membro inválido." });
    return;
  }
  if (!role) {
    res.status(400).json({ error: "Informe uma função válida." });
    return;
  }
  const check = await wouldRemoveLastActiveMaxControl(
    memberId,
    actor.storeId,
    role,
  );
  if (!check.member) {
    res.status(404).json({ error: "Membro não encontrado." });
    return;
  }
  if (check.blocked) {
    res.status(409).json({
      error: "A loja precisa manter pelo menos um Administrador ativo.",
    });
    return;
  }
  await db
    .update(storeMembersTable)
    .set({ role })
    .where(
      and(
        eq(storeMembersTable.id, memberId),
        eq(storeMembersTable.storeId, actor.storeId),
      ),
    );
  res.status(204).send();
});

router.post(
  "/team/:memberId/reset-password",
  async (req, res): Promise<void> => {
    const actor = await getCurrentActor(req);
    const memberId = Number(req.params.memberId);
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    if (!Number.isInteger(memberId) || memberId <= 0) {
      res.status(400).json({ error: "Membro inválido." });
      return;
    }
    if (password.length < minimumPasswordLength) {
      res.status(400).json({
        error: `A senha deve ter pelo menos ${minimumPasswordLength} caracteres.`,
      });
      return;
    }
    const member = await findMemberInStore(memberId, actor.storeId);
    if (!member) {
      res.status(404).json({ error: "Membro não encontrado." });
      return;
    }
    await db
      .update(usersTable)
      .set({ passwordHash: hashPassword(password), status: "active" })
      .where(eq(usersTable.id, member.userId));
    res.status(204).send();
  },
);

router.post("/team/:memberId/deactivate", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  const memberId = Number(req.params.memberId);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    res.status(400).json({ error: "Membro inválido." });
    return;
  }
  const check = await wouldRemoveLastActiveMaxControl(
    memberId,
    actor.storeId,
    undefined,
    false,
  );
  if (!check.member) {
    res.status(404).json({ error: "Membro não encontrado." });
    return;
  }
  if (check.blocked) {
    res.status(409).json({
      error: "A loja precisa manter pelo menos um Administrador ativo.",
    });
    return;
  }
  await db
    .update(storeMembersTable)
    .set({ active: false })
    .where(
      and(
        eq(storeMembersTable.id, memberId),
        eq(storeMembersTable.storeId, actor.storeId),
      ),
    );
  res.status(204).send();
});

router.post("/team/:memberId/activate", async (req, res): Promise<void> => {
  const actor = await getCurrentActor(req);
  const memberId = Number(req.params.memberId);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    res.status(400).json({ error: "Membro inválido." });
    return;
  }
  const member = await findMemberInStore(memberId, actor.storeId);
  if (!member) {
    res.status(404).json({ error: "Membro não encontrado." });
    return;
  }
  await db
    .update(storeMembersTable)
    .set({ active: true })
    .where(
      and(
        eq(storeMembersTable.id, memberId),
        eq(storeMembersTable.storeId, actor.storeId),
      ),
    );
  res.status(204).send();
});

export default router;
