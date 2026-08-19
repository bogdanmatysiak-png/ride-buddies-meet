import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { decodePolyline } from "@/lib/polyline";

type Variant = { polyline: string; km: number; minutes: number };

/** Podgląd przebiegu trasy z GPS do zbiórki: wariant najszybszy i najkrótszy. */
export function GpsRouteMap({
  fastest,
  shortest,
  show,
  className = "",
}: {
  fastest: Variant;
  shortest: Variant;
  show: "fastest" | "shortest" | "both";
  className?: string;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const linesRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !holderRef.current || mapRef.current) return;
        mapRef.current = new window.google.maps.Map(holderRef.current, {
          center: { lat: 52.07, lng: 19.48 },
          zoom: 6,
          mapTypeControl: false,
          streetViewControl: false,
        });
        setReady(true);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const maps = window.google?.maps;
    if (!ready || !mapRef.current || !maps) return;

    linesRef.current.forEach((l) => l.setMap(null));
    linesRef.current = [];

    const variants: Array<{ v: Variant; color: string; z: number }> = [];
    if (show !== "shortest") variants.push({ v: fastest, color: "#f97316", z: 3 });
    if (show !== "fastest") variants.push({ v: shortest, color: "#38bdf8", z: 2 });

    const bounds = new maps.LatLngBounds();
    let any = false;

    variants.forEach(({ v, color, z }) => {
      const path = v.polyline ? decodePolyline(v.polyline) : [];
      if (path.length < 2) return;
      any = true;
      const line = new maps.Polyline({
        path,
        map: mapRef.current,
        strokeColor: color,
        strokeOpacity: 0.9,
        strokeWeight: 5,
        zIndex: z,
      });
      linesRef.current.push(line);
      path.forEach((p) => bounds.extend(p));

      const first = path[0];
      const last = path[path.length - 1];
      if (first && last && z === variants[0]?.z) {
        linesRef.current.push(
          new maps.Marker({ position: first, map: mapRef.current, label: "A", title: "Ty" }),
          new maps.Marker({ position: last, map: mapRef.current, label: "B", title: "Zbiórka" }),
        );
      }
    });

    if (any) mapRef.current.fitBounds(bounds, 32);
  }, [ready, show, fastest, shortest]);

  if (error) return <p className="mt-2 text-xs text-destructive">{error}</p>;

  return (
    <div className={`overflow-hidden rounded-lg border border-border ${className}`}>
      <div ref={holderRef} className="h-56 w-full sm:h-64" />
    </div>
  );
}
