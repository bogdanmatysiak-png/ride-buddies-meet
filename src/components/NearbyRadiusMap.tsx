import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { RADIUS_OPTIONS, type Coords, type RadiusOption } from "@/lib/geo";

export type RideMarker = { id: string; title: string; point: Coords; inRange: boolean };

function nearestRadius(meters: number): RadiusOption {
  const km = meters / 1000;
  return RADIUS_OPTIONS.reduce((best, r) =>
    Math.abs(r - km) < Math.abs(best - km) ? r : best,
  ) as RadiusOption;
}

/** Mapa z przesuwalnym punktem startu i promieniem, który można rozciągać. */
export function NearbyRadiusMap({
  origin,
  radius,
  markers,
  onOrigin,
  onRadius,
}: {
  origin: Coords | null;
  radius: RadiusOption | null;
  markers: RideMarker[];
  onOrigin: (coords: Coords, label: string) => void;
  onRadius: (r: RadiusOption) => void;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const centerMarkerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const rideMarkersRef = useRef<any[]>([]);
  const cbRef = useRef({ onOrigin, onRadius });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  cbRef.current = { onOrigin, onRadius };

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !holderRef.current || mapRef.current) return;
        const map = new window.google.maps.Map(holderRef.current, {
          center: origin ?? { lat: 52.07, lng: 19.48 },
          zoom: origin ? 9 : 6,
          mapTypeControl: false,
          streetViewControl: false,
        });
        mapRef.current = map;
        map.addListener("click", (e: any) => {
          const lat = e.latLng?.lat();
          const lng = e.latLng?.lng();
          if (typeof lat === "number" && typeof lng === "number") {
            cbRef.current.onOrigin({ lat, lng }, "Punkt z mapy");
          }
        });
        setReady(true);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // punkt odniesienia + okrąg promienia
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!origin) {
      centerMarkerRef.current?.setMap(null);
      centerMarkerRef.current = null;
      circleRef.current?.setMap(null);
      circleRef.current = null;
      return;
    }
    if (!centerMarkerRef.current) {
      centerMarkerRef.current = new window.google.maps.Marker({
        map,
        position: origin,
        draggable: true,
        title: "Punkt odniesienia — przeciągnij",
      });
      centerMarkerRef.current.addListener("dragend", (e: any) => {
        const lat = e.latLng?.lat();
        const lng = e.latLng?.lng();
        if (typeof lat === "number" && typeof lng === "number") {
          cbRef.current.onOrigin({ lat, lng }, "Punkt z mapy");
        }
      });
    } else {
      centerMarkerRef.current.setPosition(origin);
    }

    const meters = (radius ?? 50) * 1000;
    if (!circleRef.current) {
      circleRef.current = new window.google.maps.Circle({
        map,
        center: origin,
        radius: meters,
        editable: true,
        strokeColor: "#f97316",
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: "#f97316",
        fillOpacity: 0.12,
      });
      circleRef.current.addListener("radius_changed", () => {
        const next = nearestRadius(circleRef.current.getRadius());
        cbRef.current.onRadius(next);
      });
      circleRef.current.addListener("center_changed", () => {
        const c = circleRef.current.getCenter();
        if (c) cbRef.current.onOrigin({ lat: c.lat(), lng: c.lng() }, "Punkt z mapy");
      });
    } else {
      circleRef.current.setCenter(origin);
      if (Math.round(circleRef.current.getRadius()) !== meters) circleRef.current.setRadius(meters);
    }

    map.panTo(origin);
    const bounds = circleRef.current.getBounds();
    if (bounds) map.fitBounds(bounds);
  }, [ready, origin, radius]);

  // znaczniki wypraw
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const m of rideMarkersRef.current) m.setMap(null);
    rideMarkersRef.current = markers.map(
      (m) =>
        new window.google.maps.Marker({
          map,
          position: m.point,
          title: m.title,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: m.inRange ? "#f97316" : "#94a3b8",
            fillOpacity: 1,
            strokeColor: "#0b0b0c",
            strokeWeight: 1.5,
          },
        }),
    );
  }, [ready, markers]);

  if (error) return <p className="mt-3 text-xs text-destructive">{error}</p>;

  return (
    <div className="mt-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <div ref={holderRef} className="h-72 w-full" />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Kliknij mapę, aby ustawić punkt odniesienia, przeciągnij znacznik lub rozciągnij okrąg, aby
        zmienić promień (10–150 km).
      </p>
    </div>
  );
}