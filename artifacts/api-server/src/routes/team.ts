import { Router, type IRouter } from "express";
import { and, count, eq, sql } from "drizzle-orm";
import { db, storeMembersTable, usersTable } from "@workspace/db";
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
    })
    .from(storeMembersTable)
    .innerJoin(usersTable, eq(storeMembersTable.userId, usersTable.id))
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
    })
    .from(storeMembersTable)
    .innerJoin(usersTable, eq(storeMembersTable.userId, usersTable.id))
    .where(eq(storeMembersTable.storeId, actor.storeId))
    .orderBy(storeMembersTable.createdAt);

  res.json(
    members.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
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
    res
      .status(400)
      .json({
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
      res
        .status(409)
        .json({ error: "Este e-mail já pertence à equipe desta loja." });
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

  const [createdMember] = await db
    .insert(storeMembersTable)
    .values({
      storeId: actor.storeId,
      userId,
      role,
      active: true,
      isDefault: false,
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
    res
      .status(409)
      .json({
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
      res
        .status(400)
        .json({
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
    res
      .status(409)
      .json({
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
