import type { Hospital } from "../../shared/carebridge";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const LOOKUP_TIMEOUT_MS = 9000;
const SEARCH_RADIUS_METERS = 10000;

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(bLat - aLat);
  const dLng = radians(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseHospital(element: any, index: number, latitudeOrigin: number, longitudeOrigin: number): Hospital | null {
  const tags = element?.tags ?? {};
  const latitude = asNumber(element.lat ?? element.center?.lat);
  const longitude = asNumber(element.lon ?? element.center?.lon);
  if (!tags.name || latitude === null || longitude === null) return null;
  const phone = tags.phone || tags["contact:phone"] || null;
  const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"], tags["addr:state"], tags["addr:postcode"]].filter(Boolean).join(", ") || "Address not listed in OpenStreetMap";
  const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
  const emergency = [tags.emergency, tags["healthcare:speciality"], tags["healthcare:speciality:emergency"], tags["hospital:type"]].filter(Boolean).join(" ").toLowerCase().includes("emergency");
  return {
    id: `osm-${element.type}-${element.id ?? index}`,
    name: String(tags.name),
    address,
    latitude,
    longitude,
    phone: phone ? String(phone) : null,
    emergencyAvailable: emergency,
    status: "UNVERIFIED",
    capabilities: ["GENERAL", "MEDICAL_EMERGENCY"],
    isVerified: false,
    lastVerifiedAt: new Date().toISOString(),
    sourceUrl,
    sourceLabel: "OpenStreetMap community data",
    dataSource: "openstreetmap",
    distanceKm: distanceKm(latitudeOrigin, longitudeOrigin, latitude, longitude),
  };
}

export async function findNearbyHospitals(latitude: number, longitude: number, limit = 8): Promise<Hospital[]> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
  const around = `(around:${SEARCH_RADIUS_METERS},${latitude},${longitude})`;
  const query = `[out:json][timeout:8];nwr${around}[amenity=hospital];out center tags;`;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "CareBridge/1.0 emergency navigator",
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const payload = await response.json() as { elements?: unknown[] };
      const hospitals = (payload.elements ?? [])
        .map((element, index) => parseHospital(element, index, latitude, longitude))
        .filter((hospital): hospital is Hospital => Boolean(hospital))
        .filter((hospital, index, list) => list.findIndex(other => other.name.toLowerCase() === hospital.name.toLowerCase()) === index)
        .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY))
        .slice(0, limit);
      if (hospitals.length > 0) return hospitals;
    } catch {
      // Try the next public Overpass mirror, then let the caller use verified fallback data.
    } finally {
      clearTimeout(timeout);
    }
  }
  return [];
}
