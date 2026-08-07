import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { searchPlaces, type PlaceHit } from "@/lib/places.functions";

/** Pole tekstowe z szybkim wyszukiwaniem miejsc w Google Maps. */
export function PlaceSearchInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  className,
  onPick,
}: {
  id?: string | undefined;
  name?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  onPick?: ((value: string) => void) | undefined;
}) {
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const lookup = useServerFn(searchPlaces);
  const boxRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef(false);

  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < 3 || disabled) {
      setHits([]);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await lookup({ data: { query } });
        if (!active) return;
        setHits(result);
        setOpen(result.length > 0);
      } catch {
        if (active) setHits([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [value, disabled, lookup]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(hit: PlaceHit) {
    skipRef.current = true;
    onChange(hit.name);
    onPick?.(hit.name);
    setOpen(false);
    setHits([]);
  }

  return (
    <div ref={boxRef} className={`relative ${className ?? ""}`}>
      <input
        id={id}
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && open && hits[0]) {
            e.preventDefault();
            pick(hits[0]);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        className="input-moto"
      />
      {loading && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider text-muted-foreground">
          szukam…
        </span>
      )}
      {open && hits.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
          {hits.map((hit, i) => (
            <li key={`${hit.name}-${i}`}>
              <button
                type="button"
                onClick={() => pick(hit)}
                className="block w-full px-3 py-2 text-left transition-colors hover:bg-primary/10"
              >
                <span className="block text-sm text-foreground">{hit.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {hit.address}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
