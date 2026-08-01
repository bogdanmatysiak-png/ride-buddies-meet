import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { createRide, levelLabel, ridesQueryKey, type RideLevel } from "@/lib/rides";
import { useProfile, useSession } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/nowa")({
  head: () => ({
    meta: [
      { title: "Ogłoś wyprawę motocyklową — Zakręt" },
      {
        name: "description",
        content:
          "Dodaj własną trasę: data, zbiórka, dystans i liczba miejsc. Zbierz ekipę na najbliższy weekend.",
      },
      { property: "og:title", content: "Ogłoś wyprawę motocyklową — Zakręt" },
      { property: "og:description", content: "Dodaj trasę i zbierz ekipę na weekend." },
    ],
  }),
  component: NewRide,
});

const levels: RideLevel[] = ["chill", "sport", "adventure"];

function NewRide() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { data: profile } = useProfile(user?.id);
  const [level, setLevel] = useState<RideLevel>("chill");
  const [busy, setBusy] = useState(false);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-4xl text-foreground">Ogłoś wyprawę</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Podaj podstawy — resztę dogadacie na zbiórce.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!user) return;
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            const id = await createRide(
              {
                title: String(f.get("title")),
                start: String(f.get("start")),
                end: String(f.get("end")),
                date: String(f.get("date")),
                time: String(f.get("time")),
                km: Number(f.get("km")),
                spots: Number(f.get("spots")),
                description: String(f.get("description")),
                level,
              },
              { id: user.id, nick: profile?.nick ?? "Motocyklista" },
            );
            await queryClient.invalidateQueries({ queryKey: ridesQueryKey });
            toast.success("Wyprawa ogłoszona!");
            navigate({ to: "/wyprawa/$id", params: { id } });
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Nie udało się zapisać wyprawy");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field name="title" label="Nazwa wyprawy" placeholder="Serpentyny w Beskidach" />
        <div className="grid grid-cols-2 gap-3">
          <Field name="start" label="Zbiórka" placeholder="Kraków" />
          <Field name="end" label="Cel" placeholder="Zakopane" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field name="date" label="Data" type="date" />
          <Field name="time" label="Godzina" type="time" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field name="km" label="Dystans (km)" type="number" placeholder="220" />
          <Field name="spots" label="Miejsca" type="number" placeholder="12" />
        </div>

        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Charakter jazdy
          </span>
          <div className="mt-2 flex gap-2">
            {levels.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  level === l
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50"
                }`}
              >
                {levelLabel[l]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="description"
            className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Opis
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={4}
            placeholder="Tempo, postoje, tankowanie, wymagane opony..."
            className="input-moto mt-1"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-ember transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Publikuję…" : "Opublikuj wyprawę"}
        </button>
      </form>
    </main>
  );
}

function Field({
  name,
  label,
  type = "text",
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required
        placeholder={placeholder}
        className="input-moto mt-1"
      />
    </div>
  );
}