import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./menu";
import { storesTable, usersTable } from "./tenancy";

export const fiscalSetupStatuses = [
  "not_configured",
  "configuring",
  "homologation",
  "production",
  "blocked",
  "disabled",
] as const;

export const fiscalEnvironments = ["homologation", "production"] as const;
export const fiscalEmissionModes = ["manual", "automatic"] as const;

export const storeFiscalSettingsTable = pgTable(
  "store_fiscal_settings",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id),
    setupStatus: text("setup_status").notNull().default("not_configured"),
    provider: text("provider").notNull().default("focus_nfe"),
    environment: text("environment").notNull().default("homologation"),
    emissionMode: text("emission_mode").notNull().default("manual"),

    legalName: text("legal_name"),
    tradeName: text("trade_name"),
    cnpj: text("cnpj"),
    stateRegistration: text("state_registration"),
    taxRegime: text("tax_regime"),
    crt: text("crt"),

    state: text("state"),
    city: text("city"),
    cityIbgeCode: text("city_ibge_code"),
    postalCode: text("postal_code"),
    street: text("street"),
    number: text("number"),
    neighborhood: text("neighborhood"),
    complement: text("complement"),

    series: integer("series"),
    nextNumber: integer("next_number"),
    natureOperation: text("nature_operation"),

    cscId: text("csc_id"),
    cscSecretReference: text("csc_secret_reference"),
    providerCompanyId: text("provider_company_id"),
    certificateReference: text("certificate_reference"),
    certificateStatus: text("certificate_status"),
    certificateExpiresAt: timestamp("certificate_expires_at", {
      withTimezone: true,
    }),

    configuredByUserId: integer("configured_by_user_id").references(
      () => usersTable.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("store_fiscal_settings_store_unique").on(table.storeId),
    check(
      "store_fiscal_settings_setup_status_check",
      sql`${table.setupStatus} in ('not_configured', 'configuring', 'homologation', 'production', 'blocked', 'disabled')`,
    ),
    check(
      "store_fiscal_settings_environment_check",
      sql`${table.environment} in ('homologation', 'production')`,
    ),
    check(
      "store_fiscal_settings_emission_mode_check",
      sql`${table.emissionMode} in ('manual', 'automatic')`,
    ),
  ],
);

export const fiscalGroupsTable = pgTable(
  "fiscal_groups",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id),
    name: text("name").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("fiscal_groups_store_id_idx").on(table.storeId),
    uniqueIndex("fiscal_groups_store_name_unique").on(
      table.storeId,
      table.name,
    ),
  ],
);

export const fiscalGroupRulesTable = pgTable(
  "fiscal_group_rules",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id),
    fiscalGroupId: integer("fiscal_group_id")
      .notNull()
      .references(() => fiscalGroupsTable.id),
    ncm: text("ncm"),
    cest: text("cest"),
    cfop: text("cfop"),
    commercialUnit: text("commercial_unit"),
    origin: text("origin"),
    icmsCode: text("icms_code"),
    pisCode: text("pis_code"),
    cofinsCode: text("cofins_code"),
    gtinMode: text("gtin_mode").notNull().default("product_or_no_gtin"),
    natureOperation: text("nature_operation"),
    taxData: jsonb("tax_data"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("fiscal_group_rules_store_id_idx").on(table.storeId),
    uniqueIndex("fiscal_group_rules_group_unique").on(
      table.storeId,
      table.fiscalGroupId,
    ),
  ],
);

export const productFiscalSettingsTable = pgTable(
  "product_fiscal_settings",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id),
    fiscalGroupId: integer("fiscal_group_id").references(
      () => fiscalGroupsTable.id,
    ),
    ncm: text("ncm"),
    cest: text("cest"),
    cfop: text("cfop"),
    commercialUnit: text("commercial_unit"),
    origin: text("origin"),
    icmsCode: text("icms_code"),
    pisCode: text("pis_code"),
    cofinsCode: text("cofins_code"),
    gtin: text("gtin"),
    natureOperation: text("nature_operation"),
    taxData: jsonb("tax_data"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("product_fiscal_settings_store_id_idx").on(table.storeId),
    index("product_fiscal_settings_group_id_idx").on(table.fiscalGroupId),
    uniqueIndex("product_fiscal_settings_store_product_unique").on(
      table.storeId,
      table.productId,
    ),
  ],
);

export const fiscalAuditLogsTable = pgTable(
  "fiscal_audit_logs",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id),
    actorUserId: integer("actor_user_id").references(() => usersTable.id),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("fiscal_audit_logs_store_id_idx").on(table.storeId),
    index("fiscal_audit_logs_created_at_idx").on(table.createdAt),
    index("fiscal_audit_logs_target_idx").on(table.targetType, table.targetId),
  ],
);

export const insertStoreFiscalSettingsSchema = createInsertSchema(
  storeFiscalSettingsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStoreFiscalSettings = z.infer<
  typeof insertStoreFiscalSettingsSchema
>;
export type StoreFiscalSettings = typeof storeFiscalSettingsTable.$inferSelect;

export const insertFiscalGroupSchema = createInsertSchema(
  fiscalGroupsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFiscalGroup = z.infer<typeof insertFiscalGroupSchema>;
export type FiscalGroup = typeof fiscalGroupsTable.$inferSelect;

export const insertFiscalGroupRuleSchema = createInsertSchema(
  fiscalGroupRulesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFiscalGroupRule = z.infer<typeof insertFiscalGroupRuleSchema>;
export type FiscalGroupRule = typeof fiscalGroupRulesTable.$inferSelect;

export const insertProductFiscalSettingsSchema = createInsertSchema(
  productFiscalSettingsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductFiscalSettings = z.infer<
  typeof insertProductFiscalSettingsSchema
>;
export type ProductFiscalSettings =
  typeof productFiscalSettingsTable.$inferSelect;

export const insertFiscalAuditLogSchema = createInsertSchema(
  fiscalAuditLogsTable,
).omit({ id: true, createdAt: true });
export type InsertFiscalAuditLog = z.infer<typeof insertFiscalAuditLogSchema>;
export type FiscalAuditLog = typeof fiscalAuditLogsTable.$inferSelect;
