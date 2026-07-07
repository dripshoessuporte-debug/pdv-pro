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
import { ordersTable } from "./orders";
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
export const fiscalProviders = ["focus_nfe"] as const;
export const fiscalCredentialTypes = ["api_token", "csc_secret"] as const;

export const fiscalDocumentStatuses = [
  "draft",
  "submitting",
  "processing",
  "authorized",
  "rejected",
  "error",
  "sync_pending",
  "cancelled",
] as const;

export const fiscalDocumentTypes = ["nfce"] as const;
export const fiscalInutilizationStatuses = ["submitting", "authorized", "rejected", "error"] as const;

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

export const fiscalProviderCredentialsTable = pgTable(
  "fiscal_provider_credentials",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => storesTable.id),
    provider: text("provider").notNull().default("focus_nfe"),
    environment: text("environment").notNull(),
    credentialType: text("credential_type").notNull().default("api_token"),
    encryptedValue: text("encrypted_value").notNull(),
    initializationVector: text("initialization_vector").notNull(),
    authenticationTag: text("authentication_tag").notNull(),
    keyVersion: text("key_version").notNull().default("v1"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("fiscal_provider_credentials_store_id_idx").on(table.storeId),
    uniqueIndex("fiscal_provider_credentials_unique").on(
      table.storeId,
      table.provider,
      table.environment,
      table.credentialType,
    ),
    check(
      "fiscal_provider_credentials_provider_check",
      sql`${table.provider} in ('focus_nfe')`,
    ),
    check(
      "fiscal_provider_credentials_environment_check",
      sql`${table.environment} in ('homologation', 'production')`,
    ),
    check(
      "fiscal_provider_credentials_type_check",
      sql`${table.credentialType} in ('api_token', 'csc_secret')`,
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

export const fiscalDocumentsTable = pgTable(
  "fiscal_documents",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => storesTable.id),
    orderId: integer("order_id").notNull().references(() => ordersTable.id),
    provider: text("provider").notNull().default("focus_nfe"),
    documentType: text("document_type").notNull().default("nfce"),
    environment: text("environment").notNull().default("homologation"),
    providerReference: text("provider_reference").notNull(),
    status: text("status").notNull().default("draft"),
    series: integer("series").notNull(),
    number: integer("number").notNull(),
    payloadVersion: text("payload_version").notNull(),
    payloadHash: text("payload_hash").notNull(),
    payloadSnapshot: jsonb("payload_snapshot").notNull(),
    providerStatus: text("provider_status"),
    accessKey: text("access_key"),
    protocol: text("protocol"),
    xmlUrl: text("xml_url"),
    danfceUrl: text("danfce_url"),
    rejectionCode: text("rejection_code"),
    rejectionMessage: text("rejection_message"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("fiscal_documents_store_id_idx").on(table.storeId),
    uniqueIndex("fiscal_documents_order_unique").on(table.storeId, table.orderId, table.documentType, table.environment),
    uniqueIndex("fiscal_documents_reference_unique").on(table.provider, table.environment, table.providerReference),
    uniqueIndex("fiscal_documents_number_unique").on(table.storeId, table.environment, table.series, table.number),
  ],
);


export const fiscalInutilizationsTable = pgTable(
  "fiscal_inutilizations",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").notNull().references(() => storesTable.id),
    provider: text("provider").notNull().default("focus_nfe"),
    environment: text("environment").notNull(),
    series: integer("series").notNull(),
    numberStart: integer("number_start").notNull(),
    numberEnd: integer("number_end").notNull(),
    justification: text("justification").notNull(),
    status: text("status").notNull().default("submitting"),
    providerStatus: text("provider_status"),
    protocol: text("protocol"),
    rejectionCode: text("rejection_code"),
    rejectionMessage: text("rejection_message"),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("fiscal_inutilizations_store_env_series_idx").on(table.storeId, table.environment, table.series),
    check("fiscal_inutilizations_provider_check", sql`${table.provider} in ('focus_nfe')`),
    check("fiscal_inutilizations_environment_check", sql`${table.environment} in ('homologation', 'production')`),
    check("fiscal_inutilizations_status_check", sql`${table.status} in ('submitting','authorized','rejected','error')`),
    check("fiscal_inutilizations_range_check", sql`${table.numberEnd} >= ${table.numberStart}`),
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

export const insertFiscalProviderCredentialSchema = createInsertSchema(
  fiscalProviderCredentialsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFiscalProviderCredential = z.infer<
  typeof insertFiscalProviderCredentialSchema
>;
export type FiscalProviderCredential =
  typeof fiscalProviderCredentialsTable.$inferSelect;

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

export const insertFiscalDocumentSchema = createInsertSchema(fiscalDocumentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFiscalDocument = z.infer<typeof insertFiscalDocumentSchema>;
export type FiscalDocument = typeof fiscalDocumentsTable.$inferSelect;

export const insertFiscalInutilizationSchema = createInsertSchema(fiscalInutilizationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFiscalInutilization = z.infer<typeof insertFiscalInutilizationSchema>;
export type FiscalInutilization = typeof fiscalInutilizationsTable.$inferSelect;

export const insertFiscalAuditLogSchema = createInsertSchema(
  fiscalAuditLogsTable,
).omit({ id: true, createdAt: true });
export type InsertFiscalAuditLog = z.infer<typeof insertFiscalAuditLogSchema>;
export type FiscalAuditLog = typeof fiscalAuditLogsTable.$inferSelect;
