# Drizzle migrations versionadas

- Gere migration SQL versionada: `pnpm --filter @workspace/db db:generate`
- Revise o SQL em `lib/db/drizzle/*.sql`.
- Aplique migrations: `pnpm --filter @workspace/db db:migrate`
- Em produção, **não** use `db:push`.
