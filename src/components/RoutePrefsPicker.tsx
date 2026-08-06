import type { RoutePrefs } from "@/lib/route-prefs";

const options: Array<{ key: keyof RoutePrefs; label: string; hint: string }> = [
  { key: "curvy", label: "Więcej zakrętów", hint: "wybieram wariant z największą liczbą zakrętów" },
  { key: "avoidHighways", label: "Unikaj autostrad / ekspresówek", hint: "" },
  { key: "avoidTolls", label: "Unikaj płatnych odcinków", hint: "" },
  { key: "avoidFerries", label: "Unikaj promów", hint: "" },
];

export function RoutePrefsPicker({
  prefs,
  onChange,
  title = "Preferencje trasy",
}: {
  prefs: RoutePrefs;
  onChange: (prefs: RoutePrefs) => void;
  title?: string;
}) {
  return (
    <div>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const active = prefs[o.key];
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={active}
              title={o.hint}
              onClick={() => onChange({ ...prefs, [o.key]: !active })}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}