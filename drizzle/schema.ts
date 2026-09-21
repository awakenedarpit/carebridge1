import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, double, tinyint } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const hospitals = mysqlTable("hospitals", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  city: varchar("city", { length: 120 }),
  state: varchar("state", { length: 120 }),
  postalCode: varchar("postal_code", { length: 24 }),
  latitude: double("latitude").notNull(),
  longitude: double("longitude").notNull(),
  phone: varchar("phone", { length: 64 }),
  website: text("website"),
  emergencyAvailable: tinyint("emergencyAvailable").notNull().default(0),
  status: mysqlEnum("status", ["TRUSTED_RESOURCE", "UNVERIFIED"]).notNull().default("UNVERIFIED"),
  capabilities: text("capabilities").notNull(),
  isVerified: tinyint("isVerified").notNull().default(0),
  lastVerifiedAt: timestamp("lastVerifiedAt").notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  sourceLabel: varchar("sourceLabel", { length: 255 }).notNull(),
  dataSource: mysqlEnum("data_source", ["official", "openstreetmap"]).notNull().default("official"),
  osmType: varchar("osm_type", { length: 16 }),
  osmId: varchar("osm_id", { length: 32 }),
});

export const doctors = mysqlTable("doctors", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  phoneLabel: varchar("phoneLabel", { length: 255 }).notNull(),
  specialty: varchar("specialty", { length: 255 }).notNull(),
  hospitalId: varchar("hospitalId", { length: 64 }).notNull().references(() => hospitals.id),
  isOnCall: tinyint("isOnCall").notNull().default(0),
  isVerified: tinyint("isVerified").notNull().default(0),
  lastVerifiedAt: timestamp("lastVerifiedAt").notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  sourceLabel: varchar("sourceLabel", { length: 255 }).notNull(),
});

export const incidents = mysqlTable("incidents", {
  id: varchar("id", { length: 64 }).primaryKey(),
  patientRelation: varchar("patientRelation", { length: 100 }).notNull(),
  rawText: text("rawText").notNull(),
  language: varchar("language", { length: 80 }).notNull(),
  urgency: mysqlEnum("urgency", ["EMERGENCY", "URGENT", "GENERAL"]).notNull(),
  careCategory: varchar("careCategory", { length: 64 }).notNull(),
  latitude: double("latitude").notNull(),
  longitude: double("longitude").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const actions = mysqlTable("actions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  incidentId: varchar("incidentId", { length: 64 }).notNull().references(() => incidents.id),
  doctorId: varchar("doctorId", { length: 64 }).references(() => doctors.id),
  hospitalId: varchar("hospitalId", { length: 64 }).references(() => hospitals.id),
  actionType: mysqlEnum("actionType", ["CALL_DOCTOR", "CALL_112", "NAVIGATE", "SHARE_LOCATION", "COPY_SUMMARY"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Hospital = typeof hospitals.$inferSelect;
export type Doctor = typeof doctors.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type Action = typeof actions.$inferSelect;
