import { Link } from "@tanstack/react-router";
import type { Group } from "@/lib/groups";

/** Wybór grupy przyjaciół, z którą jedziemy wyprawę. */
export function GroupPicker({
  groups,
  value,
  onChange,
  disabled,
}: {
  groups: Group[];
  value: string | null;
  onChange: (groupId: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Grupa przyjaciół
      </span>
      {groups.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Nie masz jeszcze żadnej grupy.{" "}
          <Link to="/grupy" className="font-semibold text-primary underline-offset-4 hover:underline">
            Utwórz grupę
          </Link>{" "}
          i zaproś ekipę, żeby dopisać ją do wyprawy.
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(null)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                value === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50"
              }`}
            >
              Bez grupy
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange(g.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  value === g.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50"
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Grupa pokaże się w szczegółach wyprawy — ekipa od razu wie, że to ich wspólny wyjazd.
          </p>
        </>
      )}
    </div>
  );
}
