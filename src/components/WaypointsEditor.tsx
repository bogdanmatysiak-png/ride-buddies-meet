import { useState } from "react";
import { PlaceSearchInput } from "@/components/PlaceSearchInput";
import type { OptimizeMode, OrderComparison } from "@/hooks/useOptimizeWaypoints";

export const MAX_WAYPOINTS = 20;

function hm(minutes: number) {
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function delta(before: number, after: number, unit: string) {
  const diff = after - before;
  if (diff === 0) return `bez zmian (${unit === "min" ? hm(after) : `${after} ${unit}`})`;
  const sign = diff > 0 ? "+" : "−";
  const abs = Math.abs(diff);
  return `${sign}${unit === "min" ? hm(abs) : `${abs} ${unit}`}`;
}

const modes: Array<{ key: OptimizeMode; label: string; hint: string }> = [
  { key: "fast", label: "Najszybsza", hint: "Kolejność pod najkrótszy czas jazdy" },
  {
    key: "scenic",
    label: "Malownicza / kręta",
    hint: "Bez autostrad i płatnych odcinków — więcej zakrętów i widoków",
  },
];

/** Punkty pośrednie „przez” — dodawanie plusem, usuwanie i zmiana kolejności. */
export function WaypointsEditor({
  waypoints,
  onChange,
  disabled,
  onOptimize,
  optimizing,
  canOptimize,
  mode = "fast",
  onModeChange,
  comparison,
}: {
  waypoints: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  onOptimize?: (mode: OptimizeMode) => void;
  optimizing?: boolean;
  canOptimize?: boolean;
  mode?: OptimizeMode;
  onModeChange?: (mode: OptimizeMode) => void;
  comparison?: OrderComparison | null;
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

      {onOptimize && (
        <div className="mt-2">
          <div className="flex gap-2">
            {modes.map((m) => (
              <button
                key={m.key}
                type="button"
                title={m.hint}
                aria-pressed={mode === m.key}
                disabled={disabled}
                onClick={() => onModeChange?.(m.key)}
                className={`flex-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  mode === m.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onOptimize(mode)}
            disabled={disabled || !canOptimize}
            className="mt-2 w-full rounded-md border border-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
          >
            {optimizing
              ? "Układam kolejność…"
              : mode === "scenic"
                ? "Ułóż automatycznie (kręta trasa)"
                : "Ułóż automatycznie (najszybsza trasa)"}
          </button>
          {comparison && (
            <div className="mt-2 rounded-md border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Przed vs po ułożeniu
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {comparison.changed ? "kolejność zmieniona" : "kolejność bez zmian"}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                {[
                  {
                    label: "Dystans",
                    before: `${comparison.before.km} km`,
                    after: `${comparison.after.km} km`,
                    diff: delta(comparison.before.km, comparison.after.km, "km"),
                  },
                  {
                    label: "Czas",
                    before: hm(comparison.before.minutes),
                    after: hm(comparison.after.minutes),
                    diff: delta(comparison.before.minutes, comparison.after.minutes, "min"),
                  },
                  {
                    label: "Zakręty",
                    before: String(comparison.before.turns),
                    after: String(comparison.after.turns),
                    diff: delta(comparison.before.turns, comparison.after.turns, "szt."),
                  },
                ].map((row) => (
                  <div key={row.label}>
                    <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {row.label}
                    </dt>
                    <dd className="mt-1 text-foreground">
                      <span className="text-muted-foreground line-through">{row.before}</span>{" "}
                      → <span className="font-semibold">{row.after}</span>
                    </dd>
                    <dd className="text-[11px] text-primary">{row.diff}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}

      {waypoints.length > 0 && (
        <ul className="mt-2 space-y-2">
          {waypoints.map((w, i) => (
            <li
              key={`${w}-${i}`}
              draggable={!disabled}
              data-wp-index={i}
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
              <span
                aria-hidden
                className="touch-none select-none text-sm text-muted-foreground"
                onTouchStart={() => !disabled && setDragIndex(i)}
                onTouchMove={(e) => {
                  if (disabled || dragIndex === null) return;
                  e.preventDefault();
                  const t = e.touches[0];
                  if (!t) return;
                  const el = document
                    .elementFromPoint(t.clientX, t.clientY)
                    ?.closest("[data-wp-index]");
                  const idx = el ? Number(el.getAttribute("data-wp-index")) : null;
                  if (idx !== null && !Number.isNaN(idx)) setOverIndex(idx);
                }}
                onTouchEnd={() => {
                  if (overIndex !== null) drop(overIndex);
                  else endDrag();
                }}
                onTouchCancel={endDrag}
              >
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
