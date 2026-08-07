import { useState } from "react";

export const MAX_WAYPOINTS = 20;

/** Punkty pośrednie „przez” — dodawane pojedynczo plusem, maks. 20. */
export function WaypointsEditor({
  waypoints,
  onChange,
  disabled,
}: {
  waypoints: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const full = waypoints.length >= MAX_WAYPOINTS;

  function add() {
    const value = draft.trim();
    if (!value || full) return;
    onChange([...waypoints, value]);
    setDraft("");
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Przez (punkty pośrednie)
        </span>
        <span className="text-[11px] text-muted-foreground">
          {waypoints.length}/{MAX_WAYPOINTS}
        </span>
      </div>

      {waypoints.length > 0 && (
        <ul className="mt-2 space-y-2">
          {waypoints.map((w, i) => (
            <li
              key={`${w}-${i}`}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                przez {i + 1}
              </span>
              <span className="flex-1 truncate text-sm text-foreground">{w}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(waypoints.filter((_, idx) => idx !== i))}
                aria-label={`Usuń punkt ${w}`}
                className="rounded-md border border-border px-2 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
              >
                −
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          disabled={disabled || full}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={full ? "Osiągnięto limit 20 punktów" : "np. Nowy Targ"}
          aria-label="Dodaj punkt przez"
          className="input-moto"
        />
        <button
          type="button"
          onClick={add}
          disabled={disabled || full || draft.trim().length < 2}
          aria-label="Dodaj punkt przez"
          className="shrink-0 rounded-md border border-primary px-4 text-lg font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
        >
          +
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Dodawaj po jednym miejscu — trasa poprowadzi kolejno przez te punkty.
      </p>
    </div>
  );
}