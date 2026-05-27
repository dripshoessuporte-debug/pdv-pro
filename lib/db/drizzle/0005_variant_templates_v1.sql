CREATE TABLE IF NOT EXISTS "variant_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer DEFAULT 1 NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "variant_template_options" (
  "id" serial PRIMARY KEY NOT NULL,
  "template_id" integer NOT NULL,
  "name" text NOT NULL,
  "price" numeric(10, 2) NOT NULL,
  "available" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "variant_templates" ADD CONSTRAINT "variant_templates_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "variant_template_options" ADD CONSTRAINT "variant_template_options_template_id_variant_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."variant_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variant_templates_store_id_idx" ON "variant_templates" USING btree ("store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variant_template_options_template_id_idx" ON "variant_template_options" USING btree ("template_id");
