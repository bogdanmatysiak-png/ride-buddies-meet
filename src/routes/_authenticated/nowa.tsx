import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { createRide, levelLabel, ridesQueryKey, type RideLevel } from "@/lib/rides";
import { planRoute, type RoutePlan } from "@/lib/maps.functions";
import { RouteMap } from "@/components/RouteMap";
import { useProfile, useSession } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/nowa")({
  head: () => ({
    meta: [
      { title: "Ogłoś wyprawę motocyklową — Motor Trip" },
      {
        name: "description",
        content:
          "Dodaj własną trasę: data, zbiórka, dystans i liczba miejsc. Zbierz ekipę na najbliższy weekend.",
      },
      { property: "og:title", content: "Ogłoś wyprawę motocyklową — Motor Trip" },
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
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [km, setKm] = useState("");
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const computeRoute = useServerFn(planRoute);

  async function handlePlanRoute() {
    if (start.trim().length < 2 || end.trim().length < 2) {
      toast.error("Podaj miejsce zbiórki i cel");
      return;
    }
    setPlanning(true);
    try {
      const result = await computeRoute({ data: { start: start.trim(), end: end.trim() } });
      setPlan(result);
      setKm(String(result.km));
      toast.success(
        `Trasa wyznaczona: ${result.km} km, ok. ${Math.floor(result.minutes / 60)} h ${result.minutes % 60} min`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się wyznaczyć trasy");
    } finally {
      setPlanning(false);
    }
  }

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
          <Field
            name="start"
            label="Zbiórka"
            placeholder="Kraków"
            value={start}
            onChange={setStart}
          />
          <Field name="end" label="Cel" placeholder="Zakopane" value={end} onChange={setEnd} />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <button
            type="button"
            onClick={handlePlanRoute}
            disabled={planning}
            className="w-full rounded-md border border-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
          >
            {planning ? "Liczę trasę…" : "Wyznacz trasę w Google Maps"}
          </button>
          {plan && (
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                {plan.km} km · ok. {Math.floor(plan.minutes / 60)} h {plan.minutes % 60} min jazdy
              </p>
              <RouteMap start={plan.startAddress} end={plan.endAddress} className="mt-3" />
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field name="date" label="Data" type="date" />
          <Field name="time" label="Godzina" type="time" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            name="km"
            label="Dystans (km)"
            type="number"
            placeholder="220"
            value={km}
            onChange={setKm}
          />
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
  value,
  onChange,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
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
        {...(onChange ? { value: value ?? "", onChange: (e) => onChange(e.target.value) } : {})}
        className="input-moto mt-1"
      />
    </div>
  );
}