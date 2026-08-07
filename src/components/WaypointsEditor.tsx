import { useState } from "react";
import { PlaceSearchInput } from "@/components/PlaceSearchInput";

export const MAX_WAYPOINTS = 20;

/** Punkty pośrednie „przez” — dodawanie plusem, usuwanie i zmiana kolejności. */
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
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const full = waypoints.length >= MAX_WAYPOINTS;

  function add(value = draft) {
    const clean = value.trim();
    if (clean.length < 2 || full) return;
    onChange([...waypoints, clean]);
    setDraft("");
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= waypoints.length) return;
    const next = [...waypoints];
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    onChange(next);
  }

  function endDrag() {
    setDragIndex(null);
    setOverIndex(null);
  }

  function drop(to: number) {
    if (dragIndex !== null && dragIndex !== to) move(dragIndex, to);
    endDrag();
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
              draggable={!disabled}
              onDragStart={(e) => {
                setDragIndex(i);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(i));
              }}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                setOverIndex(i);
              }}
              onDragLeave={() => setOverIndex((prev) => (prev === i ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                drop(i);
              }}
              onDragEnd={endDrag}
              className={`flex items-center gap-2 rounded-md border bg-background px-3 py-2 transition-colors ${
                dragIndex === i
                  ? "border-primary opacity-60"
                  : overIndex === i
                    ? "border-primary"
                    : "border-border"
              } ${disabled ? "" : "cursor-grab active:cursor-grabbing"}`}
            >
              <span aria-hidden className="select-none text-sm text-muted-foreground">
                ⠿
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                przez {i + 1}
              </span>
              <span className="flex-1 truncate text-sm text-foreground">{w}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={disabled || i === 0}
                  onClick={() => move(i, i - 1)}
                  aria-label={`Przenieś ${w} wyżej`}
                  className="rounded-md border border-border px-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={disabled || i === waypoints.length - 1}
                  onClick={() => move(i, i + 1)}
                  aria-label={`Przenieś ${w} niżej`}
                  className="rounded-md border border-border px-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(waypoints.filter((_, idx) => idx !== i))}
                  aria-label={`Usuń punkt ${w}`}
                  className="rounded-md border border-border px-2 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex gap-2">
        <PlaceSearchInput
          value={draft}
          onChange={setDraft}
          onPick={(picked) => add(picked)}
          disabled={disabled || full}
          placeholder={full ? "Osiągnięto limit 20 punktów" : "np. Nowy Targ"}
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => add()}
          disabled={disabled || full || draft.trim().length < 2}
          aria-label="Dodaj punkt przez"
          className="shrink-0 rounded-md border border-primary px-4 text-lg font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
        >
          +
        </button>
      </div>
      {waypoints.length > 0 && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([])}
          className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
        >
          Usuń wszystkie punkty
        </button>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Wyszukaj miejsce i dodaj plusem. Kolejność zmienisz przeciąganiem (uchwyt ⠿) albo
        strzałkami ↑↓ — trasa przelicza się na żywo.
      </p>
    </div>
  );
}
