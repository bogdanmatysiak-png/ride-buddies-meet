import { AlertTriangle, MapPin, Wand2 } from "lucide-react";
import { needsCityHint, withCountry, PLACE_HINT_TEXT } from "@/lib/place-hints";

type Props = {
  start: string;
  end: string;
  waypoints: string[];
  /** Błąd z wyznaczania trasy — wtedy podpowiedź jest wyróżniona. */
  error?: string | null;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onWaypointsChange: (value: string[]) => void;
};

/** Waliduje nazwy miejsc i podpowiada dopisanie miasta oraz kraju. */
export function RoutePlaceHints({
  start,
  end,
  waypoints,
  error,
  onStartChange,
  onEndChange,
  onWaypointsChange,
}: Props) {
  const vague: Array<{ key: string; label: string; value: string; fix: () => void }> = [];

  if (needsCityHint(start)) {
    vague.push({
      key: "start",
      label: "Zbiórka",
      value: start,
      fix: () => onStartChange(withCountry(start)),
    });
  }
  if (needsCityHint(end)) {
    vague.push({
      key: "end",
      label: "Cel",
      value: end,
      fix: () => onEndChange(withCountry(end)),
    });
  }
  waypoints.forEach((w, i) => {
    if (!needsCityHint(w)) return;
    vague.push({
      key: `wp-${i}`,
      label: `Przez ${i + 1}`,
      value: w,
      fix: () =>
        onWaypointsChange(waypoints.map((item, idx) => (idx === i ? withCountry(item) : item))),
    });
  });

  if (vague.length === 0) return null;

  const fixAll = () => {
    if (needsCityHint(start)) onStartChange(withCountry(start));
    if (needsCityHint(end)) onEndChange(withCountry(end));
    onWaypointsChange(waypoints.map((w) => (needsCityHint(w) ? withCountry(w) : w)));
  };

  return (
    <div
      className={`mt-2 rounded-md border px-3 py-2 text-xs ${
        error ? "border-destructive/60 bg-destructive/10" : "border-border bg-muted/30"
      }`}
    >
      <p className="flex items-start gap-1.5 font-semibold text-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        {error
          ? "Google nie znalazło trasy — uzupełnij miasto i kraj w tych miejscach:"
          : "Uzupełnij miasto i kraj, żeby Google pewnie znalazł trasę:"}
      </p>
      <ul className="mt-1.5 space-y-1">
        {vague.map((item) => (
          <li key={item.key} className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0 text-primary" />
            <span className="font-semibold uppercase tracking-wider">{item.label}:</span>
            <span className="text-foreground">„{item.value.trim()}”</span>
            <button
              type="button"
              onClick={item.fix}
              className="rounded-sm border border-primary px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary hover:bg-primary/10"
            >
              Dopisz „, Polska”
            </button>
          </li>
        ))}
      </ul>
      {vague.length > 1 && (
        <button
          type="button"
          onClick={fixAll}
          className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-primary px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary hover:bg-primary/10"
        >
          <Wand2 className="h-3 w-3 shrink-0" />
          Popraw wszystkie
        </button>
      )}
      <p className="mt-1.5 text-[11px] text-muted-foreground">{PLACE_HINT_TEXT}</p>
    </div>
  );
}
