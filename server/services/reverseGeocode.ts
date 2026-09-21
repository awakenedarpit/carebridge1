const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const BIG_DATA_CLOUD_ENDPOINT = "https://api.bigdatacloud.net/data/reverse-geocode-client";
const LOOKUP_TIMEOUT_MS = 7000;

type BigDataCloudResponse = {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  postcode?: string;
  countryName?: string;
};

function cleanAddress(parts: Array<string | undefined>) {
  const unique = Array.from(new Set(parts.map(part => part?.trim()).filter((part): part is string => Boolean(part))));
  return unique.length > 0 ? unique.join(", ") : null;
}

async function fetchJson(url: URL, headers: Record<string, string>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    return response.ok ? await response.json() as Record<string, unknown> : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const nominatimUrl = new URL(NOMINATIM_ENDPOINT);
  nominatimUrl.searchParams.set("lat", String(latitude));
  nominatimUrl.searchParams.set("lon", String(longitude));
  nominatimUrl.searchParams.set("format", "jsonv2");
  nominatimUrl.searchParams.set("zoom", "18");
  const nominatim = await fetchJson(nominatimUrl, {
    Accept: "application/json",
    "User-Agent": "CareBridge/1.0 (emergency navigator; contact repository owner)",
  });
  if (typeof nominatim?.display_name === "string" && nominatim.display_name.trim()) return nominatim.display_name.trim();

  const fallbackUrl = new URL(BIG_DATA_CLOUD_ENDPOINT);
  fallbackUrl.searchParams.set("latitude", String(latitude));
  fallbackUrl.searchParams.set("longitude", String(longitude));
  fallbackUrl.searchParams.set("localityLanguage", "en");
  const fallback = await fetchJson(fallbackUrl, { Accept: "application/json", "User-Agent": "CareBridge/1.0" }) as BigDataCloudResponse | null;
  return fallback ? cleanAddress([fallback.locality, fallback.city, fallback.principalSubdivision, fallback.postcode, fallback.countryName]) : null;
}
