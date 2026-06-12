import { Router, type IRouter } from "express";
import {
  buildAuthenticatedContext,
  clearSessionCookie,
  findActiveUserByEmail,
  resolveAuthenticatedContext,
  setSessionCookie,
  touchLastLogin,
  verifyPassword,
} from "../lib/auth";

const router: IRouter = Router();

const invalidCredentialsMessage = "E-mail ou senha inválidos.";

function serializeContext(context: NonNullable<Awaited<ReturnType<typeof buildAuthenticatedContext>>>) {
  return {
    user: context.user,
    stores: context.stores,
    currentStore: context.currentStore,
  };
}

router.post("/auth/login", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (!email.trim() || !password) {
    res.status(401).json({ error: invalidCredentialsMessage });
    return;
  }

  const user = await findActiveUserByEmail(email);
  if (!user || user.status !== "active") {
    res.status(401).json({ error: invalidCredentialsMessage });
    return;
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    res.status(401).json({ error: invalidCredentialsMessage });
    return;
  }

  const context = await buildAuthenticatedContext(user.id);
  if (!context) {
    res.status(403).json({ error: "Usuário sem loja ativa." });
    return;
  }

  await touchLastLogin(user.id);
  setSessionCookie(res, context.user.id, context.currentStore.id);
  res.json(serializeContext(context));
});

router.post("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).send();
});

router.get("/auth/me", async (req, res) => {
  const context = await resolveAuthenticatedContext(req);
  if (!context) {
    res.status(401).json({ error: "Autenticação necessária." });
    return;
  }

  res.json(serializeContext(context));
});

export default router;
