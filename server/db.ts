import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, doctors, hospitals, users } from "../drizzle/schema";
import type { Doctor, Hospital } from "../shared/carebridge";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

function toHospital(row: typeof hospitals.$inferSelect): Hospital {
  const capabilities = row.capabilities.split(",").map(value => value.trim()).filter(Boolean) as Hospital["capabilities"];
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    phone: row.phone ?? null,
    emergencyAvailable: Boolean(row.emergencyAvailable),
    status: row.status,
    capabilities,
    isVerified: Boolean(row.isVerified),
    lastVerifiedAt: row.lastVerifiedAt.toISOString(),
    sourceUrl: row.sourceUrl,
    sourceLabel: row.sourceLabel,
    dataSource: row.dataSource,
  };
}

function toDoctor(row: typeof doctors.$inferSelect): Doctor {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    phoneLabel: row.phoneLabel,
    specialty: row.specialty,
    hospitalId: row.hospitalId,
    isOnCall: Boolean(row.isOnCall),
    isVerified: Boolean(row.isVerified),
    lastVerifiedAt: row.lastVerifiedAt.toISOString(),
    sourceUrl: row.sourceUrl,
    sourceLabel: row.sourceLabel,
  };
}

export async function getHospitalsFromDatabase(): Promise<Hospital[] | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    return (await db.select().from(hospitals)).map(toHospital);
  } catch (error) {
    console.warn("[Database] Could not load hospitals; using fallback resources:", error);
    return null;
  }
}

export async function getDoctorsFromDatabase(): Promise<Doctor[] | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    return (await db.select().from(doctors)).map(toDoctor);
  } catch (error) {
    console.warn("[Database] Could not load doctors; using fallback resources:", error);
    return null;
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}
