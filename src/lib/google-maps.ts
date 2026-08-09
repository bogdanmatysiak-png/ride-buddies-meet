declare global {
  interface Window {
    google?: any;
    __motorTripMapsPromise?: Promise<void>;
  }
}

const BROWSER_KEY = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as
  | string
  | undefined;

/** Wczytuje Google Maps JS API raz na sesję przeglądarki. */
export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Brak przeglądarki"));
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