import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createExtension("pgcrypto", { ifNotExists: true });
  pgm.createExtension("pg_trgm", { ifNotExists: true });

  pgm.createTable("users", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    google_sub: { type: "text", notNull: true, unique: true },
    email: { type: "text" },
    display_name: { type: "text" },
    avatar_url: { type: "text" },
    is_premium: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    last_login_at: { type: "timestamptz" },
  });

  pgm.createTable("sponsors", {
    id: { type: "bigserial", primaryKey: true },
    organisation_name: { type: "text", notNull: true },
    organisation_name_normalized: { type: "text", notNull: true },
    town_city: { type: "text" },
    county: { type: "text" },
    type_rating: { type: "text" },
    route: { type: "text" },
    source_snapshot_date: { type: "date" },
    raw_row: { type: "jsonb" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("sponsors", "organisation_name_normalized", {
    name: "sponsors_name_normalized_idx",
  });
  pgm.createIndex("sponsors", "organisation_name_normalized", {
    name: "sponsors_name_normalized_trgm_idx",
    method: "gin",
    opclass: "gin_trgm_ops",
  });

  pgm.createTable("app_config", {
    key: { type: "text", primaryKey: true },
    value: { type: "text", notNull: true },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_by: { type: "text" },
  });

  pgm.createTable("daily_usage", {
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "CASCADE" },
    usage_date: { type: "date", notNull: true },
    count: { type: "integer", notNull: true, default: 0 },
  });
  pgm.addConstraint("daily_usage", "daily_usage_pkey", {
    primaryKey: ["user_id", "usage_date"],
  });

  pgm.createTable("subscriptions", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_id: { type: "uuid", notNull: true, unique: true, references: "users", onDelete: "CASCADE" },
    stripe_customer_id: { type: "text", unique: true },
    stripe_subscription_id: { type: "text", unique: true },
    status: { type: "text" },
    current_period_end: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("subscriptions");
  pgm.dropTable("daily_usage");
  pgm.dropTable("app_config");
  pgm.dropTable("sponsors");
  pgm.dropTable("users");
}
