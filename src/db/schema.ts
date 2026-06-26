import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const childStatusEnum = pgEnum("child_status", ["unpaired", "paired", "disabled"]);
export const platformEnum = pgEnum("device_platform", ["android", "ios", "web"]);
export const liveScreenStatusEnum = pgEnum("live_screen_status", [
  "requested",
  "active",
  "ended",
  "failed"
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
};

export const admins = pgTable("admins", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  ...timestamps
});

export const children = pgTable(
  "children",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    pairingCode: varchar("pairing_code", { length: 10 }).notNull().unique(),
    status: childStatusEnum("status").default("unpaired").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => ({
    adminIdx: index("children_admin_id_idx").on(table.adminId),
    pairingCodeIdx: uniqueIndex("children_pairing_code_idx").on(table.pairingCode)
  })
);

export const childDevices = pgTable(
  "child_devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    deviceUuid: varchar("device_uuid", { length: 255 }).notNull().unique(),
    platform: platformEnum("platform").notNull(),
    osVersion: varchar("os_version", { length: 80 }).notNull(),
    appVersion: varchar("app_version", { length: 80 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    lastOnlineAt: timestamp("last_online_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => ({
    childIdx: index("child_devices_child_id_idx").on(table.childId),
    deviceUuidIdx: uniqueIndex("child_devices_device_uuid_idx").on(table.deviceUuid)
  })
);

export const appBlockRules = pgTable(
  "app_block_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    packageName: varchar("package_name", { length: 255 }).notNull(),
    label: varchar("label", { length: 120 }),
    isEnabled: boolean("is_enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    childIdx: index("app_block_rules_child_id_idx").on(table.childId)
  })
);

export const webFilterRules = pgTable(
  "web_filter_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    domain: varchar("domain", { length: 255 }).notNull(),
    category: varchar("category", { length: 80 }),
    isBlocked: boolean("is_blocked").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    childIdx: index("web_filter_rules_child_id_idx").on(table.childId)
  })
);

export const liveScreenSessions = pgTable(
  "live_screen_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    status: liveScreenStatusEnum("status").default("requested").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    reason: varchar("reason", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    childIdx: index("live_screen_sessions_child_id_idx").on(table.childId),
    adminIdx: index("live_screen_sessions_admin_id_idx").on(table.adminId)
  })
);

export type Admin = typeof admins.$inferSelect;
export type Child = typeof children.$inferSelect;
export type LiveScreenSession = typeof liveScreenSessions.$inferSelect;
