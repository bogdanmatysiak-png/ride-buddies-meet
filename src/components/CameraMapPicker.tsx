import { useEffect, useRef, useState } from "react";

const BROWSER_KEY = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as
  | string
  | undefined;

declare global {
  interface Window {
    google?: any;
    __motorTripMapsPromise?: Promise<void>;
  }
}

function loadMaps(): Promise<void> {
  if (!BROWSER_KEY) return Promise.reject(new Error("Brak klucza Google Maps"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__motorTripMapsPromise) return window.__motorTripMapsPromise;
  window.__motorTripMapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${BROWSER_KEY}&language=pl&region=PL`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Nie udało się wczytać mapy Google"));
    document.head.appendChild(script);
  });
  return window.__motorTripMapsPromise;
}

/** Klikalna mapa do wskazania miejsca fotoradaru. */
export function CameraMapPicker({
  value,
  onPick,
  className = "",
}: {
  value: { lat: number; lng: number } | null;
  onPick: (point: { lat: number; lng: number }) => void;
  className?: string;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const pickRef = useRef(onPick);
  const [error, setError] = useState<string | null>(null);

  pickRef.current = onPick;

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !holderRef.current || mapRef.current) return;
        const center = value ?? { lat: 52.07, lng: 19.48 };
        const map = new window.google.maps.Map(holderRef.current, {
          center,
          zoom: value ? 14 : 6,
          mapTypeControl: false,
          streetViewControl: false,
        });
        mapRef.current = map;
        map.addListener("click", (e: any) => {
          const lat = e.latLng?.lat();
          const lng = e.latLng?.lng();
          if (typeof lat === "number" && typeof lng === "number") {
            pickRef.current({ lat, lng });
          }
        });
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    if (!value) {
      markerRef.current?.setMap(null);
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({ map, position: value });
    } else {
      markerRef.current.setPosition(value);
    }
    map.panTo(value);
    if (map.getZoom() < 12) map.setZoom(13);
  }, [value]);

  if (error) {
    return <p className={`text-xs text-destructive ${className}`}>{error}</p>;
  }

  return (
    <div className={`overflow-hidden rounded-lg border border-border ${className}`}>
      <div ref={holderRef} className="h-64 w-full" />
    </div>
  );
}