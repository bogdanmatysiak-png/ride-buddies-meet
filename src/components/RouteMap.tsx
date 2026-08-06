const BROWSER_KEY = import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY'] as
  | string
  | undefined;

export function RouteMap({
  start,
  end,
  className = "",
}: {
  start: string;
  end: string;
  className?: string;
}) {
  if (!BROWSER_KEY || !start || !end) return null;
  const src = `https://www.google.com/maps/embed/v1/directions?key=${BROWSER_KEY}&origin=${encodeURIComponent(
    start,
  )}&destination=${encodeURIComponent(end)}&mode=driving&avoid=highways|tolls|ferries&language=pl`;
  return (
    <div className={`overflow-hidden rounded-lg border border-border ${className}`}>
      <iframe
        title={`Trasa ${start} – ${end}`}
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="h-64 w-full border-0"
        allowFullScreen
      />
    </div>
  );
}