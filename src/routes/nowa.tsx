import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { addRide, levelLabel, type RideLevel } from "@/lib/rides";

export const Route = createFileRoute("/nowa")({
  head: () => ({
    meta: [
      { title: "Ogłoś wyprawę motocyklową — Zakręt" },
      {
        name: "description",
        content:
          "Dodaj własną trasę: data, zbiórka, dystans i liczba miejsc. Zbierz ekipę na najbliższy weekend.",
      },
      { property: "og:title", content: "Ogłoś wyprawę motocyklową — Zakręt" },
      {
        property: "og:description",
        content: "Dodaj trasę i zbierz ekipę na weekend.",
      },
    ],
  }),
  component: NewRide,
});

const levels: RideLevel[] = ["chill", "sport", "adventure"];

function NewRide() {
  const navigate = useNavigate();
  const [level, setLevel] = useState<RideLevel>("chill");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-4xl text-foreground">Ogłoś wyprawę</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Podaj podstawy — resztę dogadacie w komentarzach na zbiórce.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const id = addRide({
            title: String(f.get("title")),
            start: String(f.get("start")),
            end: String(f.get("end")),
            date: String(f.get("date")),
            time: String(f.get("time")),
            km: Number(f.get("km")),
            spots: Number(f.get("spots")),
            host: String(f.get("host")),
            description: String(f.get("description")),
            level,
          });
          toast.success("Wyprawa ogłoszona!");
          navigate({ to: "/wyprawa/$id", params: { id } });
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
        <Field name="host" label="Twój nick" placeholder="Marek „Kruk”" />

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
            className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-ember transition-opacity hover:opacity-90"
        >
          Opublikuj wyprawę
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
        className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary"
      />
    </div>
  );
}