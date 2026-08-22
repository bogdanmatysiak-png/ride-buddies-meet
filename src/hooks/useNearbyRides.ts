import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { geocodeAddresses } from "@/lib/geo.functions";
import { useSession } from "@/hooks/useAuth";
import {
  cacheKey,
  distanceKm,
  readGeoCache,
  writeGeoCache,
  readStoredOrigin,
  writeStoredOrigin,
  type Coords,
  type RadiusOption,
} from "@/lib/geo";

export function useNearbyRides(addresses: string[]) {
  const geocode = useServerFn(geocodeAddresses);
  const { session } = useSession();
  const [origin, setOrigin] = useState<Coords | null>(null);
  const [originLabel, setOriginLabel] = useState("");
  const [radius, setRadius] = useState<RadiusOption | null>(null);
  const [error, setError] = useState<string | null>(null);

  // przywracamy ostatnio wybrany punkt i promień (tylko po hydracji)
  useEffect(() => {
    const stored = readStoredOrigin();
    if (!stored) return;
    setOrigin(stored.coords);
    setOriginLabel(stored.label);
    setRadius(stored.radius);
  }, []);

  useEffect(() => {
    if (origin) writeStoredOrigin({ coords: origin, label: originLabel, radius });
  }, [origin, originLabel, radius]);

  const unique = Array.from(new Set(addresses.map((a) => a.trim()).filter(Boolean))).sort();
  const enabled = Boolean(session) && Boolean(origin && radius) && unique.length > 0;

  const { data: points = {}, isFetching } = useQuery({
    queryKey: ["geocode", unique],
    enabled,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: async () => {
      const cache = readGeoCache();
      const found: Record<string, Coords> = {};
      const missing: string[] = [];
      for (const address of unique) {
        const hit = cache[cacheKey(address)];
        if (hit) found[cacheKey(address)] = hit;
        else missing.push(address);
      }
      for (let i = 0; i < missing.length; i += 25) {
        const chunk = missing.slice(i, i + 25);
        const res = await geocode({ data: { addresses: chunk } });
        const fresh: Record<string, Coords> = {};
        for (const p of res) fresh[cacheKey(p.address)] = { lat: p.lat, lng: p.lng };
        writeGeoCache(fresh);
        Object.assign(found, fresh);
      }
      return found;
    },
  });

  const distanceFor = useCallback(
    (address: string): number | null => {
      if (!origin) return null;
      const point = points[cacheKey(address)];
      return point ? distanceKm(origin, point) : null;
    },
    [origin, points],
  );

  const pointFor = useCallback(
    (address: string): Coords | null => points[cacheKey(address)] ?? null,
    [points],
  );

  const setOriginFromCoords = useCallback((coords: Coords, label: string) => {
    setOrigin(coords);
    setOriginLabel(label);
    setError(null);
  }, []);

  const setOriginFromAddress = useCallback(
    async (address: string) => {
      setError(null);
      if (!session) {
        setError("Zaloguj się, aby szukać wypraw w okolicy");
        return;
      }
      const cached = readGeoCache()[cacheKey(address)];
      if (cached) {
        setOriginFromCoords(cached, address);
        return;
      }
      try {
        const res = await geocode({ data: { addresses: [address] } });
        const first = res[0];
        if (!first) {
          setError("Nie znaleźliśmy takiego miejsca");
          return;
        }
        writeGeoCache({ [cacheKey(address)]: { lat: first.lat, lng: first.lng } });
        setOriginFromCoords({ lat: first.lat, lng: first.lng }, address);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nie udało się ustalić lokalizacji");
      }
    },
    [geocode, session, setOriginFromCoords],
  );

  const clearOrigin = useCallback(() => {
    setOrigin(null);
    setOriginLabel("");
    setRadius(null);
    setError(null);
    writeStoredOrigin(null);
  }, []);

  return {
    origin,
    originLabel,
    radius,
    setRadius,
    error,
    setError,
    isLoading: isFetching,
    distanceFor,
    pointFor,
    setOriginFromCoords,
    setOriginFromAddress,
    clearOrigin,
  };
}
