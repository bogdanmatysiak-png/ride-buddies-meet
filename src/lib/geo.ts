export type Coords = { lat: number; lng: number };

export const RADIUS_OPTIONS = [50, 70, 100, 150] as const;
export type RadiusOption = (typeof RADIUS_OPTIONS)[number];

const CACHE_KEY = "motortrip.geocache.v1";

export function distanceKm(a: Coords, b: Coords) {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function normalize(address: string) {
  return address.trim().toLowerCase();
}

export function readGeoCache(): Record<string, Coords> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, Coords>;
  } catch {
    return {};
  }
}

export function writeGeoCache(entries: Record<string, Coords>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ...readGeoCache(), ...entries }));
  } catch {
    // brak miejsca w localStorage — pomijamy cache
  }
}

export function cacheKey(address: string) {
  return normalize(address);
}

export function getBrowserLocation(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Twoja przeglądarka nie udostępnia lokalizacji"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error("Nie udało się pobrać lokalizacji — wpisz miasto ręcznie")),
      { timeout: 10000 },
    );
  });
}
