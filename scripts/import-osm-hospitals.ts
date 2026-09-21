import { readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

type Feature = {
  type: "Feature";
  id?: string | number;
  geometry?: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
};

type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };

type HospitalRecord = {
  id: string;
  name: string;
  address: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  website: string | null;
  emergencyAvailable: boolean;
  status: "UNVERIFIED";
  capabilities: string;
  isVerified: false;
  lastVerifiedAt: string;
  sourceUrl: string;
  sourceLabel: string;
  dataSource: "openstreetmap";
  osmType: string;
  osmId: string;
};

const DEFAULT_INPUT = path.resolve("data/processed/india-hospitals.geojson");
const sourceDate = new Date().toISOString();

function arg(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

function text(properties: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function cleanPhone(value: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function coordinates(feature: Feature): [number, number] | null {
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return null;
  if (feature.geometry?.type === "Point" && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    return [coordinates[0], coordinates[1]];
  }
  const firstPoint = JSON.stringify(coordinates).match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/);
  if (!firstPoint) return null;
  const [lng, lat] = firstPoint[0].split(",").map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

function capabilities(properties: Record<string, unknown>) {
  const raw = [
    text(properties, "healthcare:speciality", "healthcare_speciality"),
    text(properties, "description", "operator"),
  ].filter(Boolean).join(" ").toLowerCase();
  const result = new Set(["GENERAL"]);
  if (/emergency|trauma|accident/.test(raw)) result.add("MEDICAL_EMERGENCY");
  if (/cardio|heart|cardiac|chest/.test(raw)) result.add("CARDIO_RESPIRATORY");
  if (/neuro|brain|stroke/.test(raw)) result.add("NEUROLOGICAL");
  if (/pediatr|children|child/.test(raw)) result.add("PEDIATRIC");
  if (/matern|women|obstet|gyn/.test(raw)) result.add("WOMEN_HEALTH");
  if (/trauma|orthop|accident/.test(raw)) result.add("TRAUMA");
  return [...result].join(",");
}

function toRecord(feature: Feature): HospitalRecord | null {
  const properties = feature.properties ?? {};
  const name = text(properties, "name", "official_name", "short_name");
  const point = coordinates(feature);
  if (!name || !point) return null;
  const osmId = String(feature.id ?? text(properties, "@id", "osm_id") ?? "");
  if (!osmId) return null;
  const [longitude, latitude] = point;
  const city = text(properties, "addr:city", "addr:town", "addr:village", "addr:municipality");
  const state = text(properties, "addr:state", "is_in:state");
  const postalCode = text(properties, "addr:postcode");
  const parts = [
    text(properties, "addr:housenumber"),
    text(properties, "addr:street"),
    city,
    state,
    postalCode,
  ].filter(Boolean);
  const address = parts.join(", ") || [city, state, postalCode].filter(Boolean).join(", ") || "Address not listed in OpenStreetMap";
  const osmType = osmId.split("/")[0] || "way";
  const numericId = osmId.split("/").at(-1) ?? osmId;
  return {
    id: `osm-${osmType}-${numericId}`.slice(0, 64),
    name,
    address,
    city,
    state,
    postalCode,
    latitude,
    longitude,
    phone: cleanPhone(text(properties, "contact:phone", "phone", "contact:mobile")),
    website: text(properties, "contact:website", "website", "url"),
    emergencyAvailable: text(properties, "emergency") === "yes",
    status: "UNVERIFIED",
    capabilities: capabilities(properties),
    isVerified: false,
    lastVerifiedAt: sourceDate,
    sourceUrl: `https://www.openstreetmap.org/${osmType}/${numericId}`,
    sourceLabel: "OpenStreetMap (India extract)",
    dataSource: "openstreetmap",
    osmType,
    osmId: numericId,
  };
}

async function main() {
  const input = path.resolve(arg("input", DEFAULT_INPUT)!);
  const dryRun = flag("dry-run");
  const limit = Number(arg("limit", "0"));
  const raw = JSON.parse(await readFile(input, "utf8")) as FeatureCollection;
  const records: HospitalRecord[] = [];
  const seen = new Set<string>();
  for (const feature of raw.features ?? []) {
    const record = toRecord(feature);
    if (!record) continue;
    const key = `${normalizeName(record.name)}|${record.latitude.toFixed(4)}|${record.longitude.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push(record);
    if (limit > 0 && records.length >= limit) break;
  }

  const withPhone = records.filter(record => record.phone).length;
  console.log(JSON.stringify({ input, records: records.length, withPhone, dryRun }, null, 2));
  if (dryRun) return;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required unless --dry-run is supplied");

  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    await connection.query("START TRANSACTION");
    for (const record of records) {
      await connection.query(
        `INSERT INTO hospitals
          (id, name, address, city, state, postal_code, latitude, longitude, phone, website,
           emergencyAvailable, status, capabilities, isVerified, lastVerifiedAt, sourceUrl,
           sourceLabel, data_source, osm_type, osm_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name=VALUES(name), address=VALUES(address), city=VALUES(city), state=VALUES(state),
           postal_code=VALUES(postal_code), latitude=VALUES(latitude), longitude=VALUES(longitude),
           phone=VALUES(phone), website=VALUES(website), emergency_available=VALUES(emergency_available),
           capabilities=VALUES(capabilities), last_verified_at=VALUES(last_verified_at),
           source_url=VALUES(source_url), source_label=VALUES(source_label), data_source=VALUES(data_source),
           osm_type=VALUES(osm_type), osm_id=VALUES(osm_id)`,
        [record.id, record.name, record.address, record.city, record.state, record.postalCode,
          record.latitude, record.longitude, record.phone, record.website, record.emergencyAvailable,
          record.status, record.capabilities, record.isVerified, record.lastVerifiedAt,
          record.sourceUrl, record.sourceLabel, record.dataSource, record.osmType, record.osmId],
      );
    }
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    await connection.end();
  }
  console.log(`Upserted ${records.length} India hospital records.`);
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
