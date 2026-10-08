import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export type Service = { n: string; min: number; price: number };

export const profiles = pgTable("profiles", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull(),
});

export const businesses = pgTable("businesses", {
  id: text().primaryKey(),
  name: text().notNull(),
  cat: text().notNull(),
  em: text().notNull(),
  addr: text().notNull(),
  hours: text().notNull(),
  about: text().notNull(),
  services: jsonb().$type<Service[]>().notNull(),
  ownerId: text("owner_id").references(() => profiles.id, { onDelete: "set null" }),
});

export const bookings = pgTable("bookings", {
  id: text().primaryKey(),
  clientId: text("client_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  service: text().notNull(),
  price: integer().notNull(),
  date: text().notNull(),
  time: text().notNull(),
  status: text().notNull().default("pending"),
  stars: integer(),
  review: text(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("bookings_active_slot").on(table.businessId, table.date, table.time)
    .where(sql`${table.status} in ('pending', 'confirmed')`),
  check("bookings_status", sql`${table.status} in ('pending', 'confirmed', 'completed', 'late', 'declined', 'cancelled', 'noshow')`),
  check("bookings_stars", sql`${table.stars} between 1 and 5`),
]);
