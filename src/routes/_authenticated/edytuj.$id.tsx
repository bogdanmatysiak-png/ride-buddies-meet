import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  deleteRide,
  fetchRides,
  levelLabel,
  ridesQueryKey,
  updateRide,
  type RideLevel,
} from "@/lib/rides";
import { planRoute } from "@/lib/maps.functions";
import { RouteMap } from "@/components/RouteMap";
import { RoutePrefsPicker } from "@/components/RoutePrefsPicker";
import {
  defaultRoutePrefs,
  prefsFromProfile,
  prefsSummary,
  saveRoutePrefs,
  type RoutePrefs,
} from "@/lib/route-prefs";
import { useIsAdmin, useProfile, useSession } from "@/hooks/useAuth";
import { rideMessagesQueryKey, sendRideUpdateNotice } from "@/lib/chat";

export const Route = createFileRoute("/_authenticated/edytuj/$id")({
  head: () => ({
    meta: [
      { title: "Edytuj swoją wyprawę — Motor Trip" },
      {
        name: "description",
        content:
          "Zmień trasę, datę, dystans i liczbę miejsc w wyprawie, którą prowadzisz, albo ją odwołaj.",
      },
      { property: "og:title", content: "Edytuj swoją wyprawę — Motor Trip" },
      { property: "og:description", content: "Aktualizuj szczegóły trasy, którą prowadzisz." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditRide,
});

const levels: RideLevel[] = ["chill", "sport", "adventure"];

function EditRide() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const isAdmin = useIsAdmin(user?.id);
  const { data: profile } = useProfile(user?.id);
  const { data: rides = [], isLoading } = useQuery({
    queryKey: ridesQueryKey,
    queryFn: fetchRides,
  });
  const ride = rides.find((r) => r.id === id);

  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [km, setKm] = useState("");
  const [spots, setSpots] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<RideLevel>("chill");
  const [intercom, setIntercom] = useState(false);
  const [intercomType, setIntercomType] = useState("");
  const [busy, setBusy] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [prefs, setPrefs] = useState<RoutePrefs>(defaultRoutePrefs);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [recalculated, setRecalculated] = useState<string | null>(null);
  const computeRoute = useServerFn(planRoute);

  useEffect(() => {
    if (profile) setPrefs(prefsFromProfile(profile));
  }, [profile]);

  useEffect(() => {
    if (!ride) return;
    setTitle(ride.title);
    setStart(ride.start);
    setEnd(ride.end);
    setDate(ride.date);
    setTime(ride.time);
    setKm(String(ride.km));
    setSpots(String(ride.spots));
    setDescription(ride.description);
    setLevel(ride.level);
    setIntercom(ride.intercom);
    setIntercomType(ride.intercomType);
  }, [ride]);

  if (isLoading) {
    return <main className="mx-auto max-w-3xl px-4 py-12 text-muted-foreground">Ładuję…</main>;
  }

  if (!ride) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl text-foreground">Nie znaleziono wyprawy</h1>
        <Link to="/profil" className="mt-4 inline-block font-semibold text-primary">
          Wróć do profilu
        </Link>
      </main>
    );
  }

  if (user && ride.hostId !== user.id && !isAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl text-foreground">To nie Twoja wyprawa</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Edytować trasę może tylko motocyklista, który ją prowadzi.
        </p>
        <Link to="/wyprawa/$id" params={{ id }} className="mt-4 inline-block font-semibold text-primary">
          Zobacz wyprawę
        </Link>
      </main>
    );
  }

  async function handlePlanRoute() {
    if (start.trim().length < 2 || end.trim().length < 2) {
      toast.error("Podaj miejsce zbiórki i cel");
      return;
    }
    setPlanning(true);
    try {
      const result = await computeRoute({
        data: { start: start.trim(), end: end.trim(), ...prefs },
      });
      setKm(String(result.km));
      setRecalculated(prefsSummary(prefs));
      toast.success(
        `Trasa wyznaczona: ${result.km} km, ok. ${Math.floor(result.minutes / 60)} h ${result.minutes % 60} min (${prefsSummary(prefs)})`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się wyznaczyć trasy");
    } finally {
      setPlanning(false);
    }
  }

  async function handleSavePrefs() {
    if (!user) return;
    setSavingPrefs(true);
    try {
      await saveRoutePrefs(user.id, prefs);
      await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      toast.success("Zapisałem Twoje domyślne preferencje trasy");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się zapisać preferencji");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const changes: string[] = [];
      if (start.trim() !== ride.start || end.trim() !== ride.end) {
        changes.push(`nowa trasa: ${start.trim()} → ${end.trim()}`);
      }
      if (Number(km) !== ride.km) {
        changes.push(`dystans: ${ride.km} km → ${Number(km)} km`);
      }
      if (date !== ride.date || time !== ride.time) {
        changes.push(`zbiórka: ${date}, ${time}`);
      }
      if (recalculated) {
        changes.push(`preferencje trasy: ${recalculated}`);
      }

      await updateRide(id, {
        title,
        start,
        end,
        date,
        time,
        km: Number(km),
        spots: Number(spots),
        description,
        level,
        intercom,
        intercomType: intercomType.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ridesQueryKey });
      if (user && changes.length > 0) {
        try {
          await sendRideUpdateNotice(id, user.id, changes);
          await queryClient.invalidateQueries({ queryKey: rideMessagesQueryKey(id) });
          toast.success("Powiadomiłem uczestników o zmianach na czacie wyprawy");
        } catch {
          toast.error("Zmiany zapisane, ale nie udało się powiadomić uczestników");
        }
      }
      toast.success("Wyprawa zaktualizowana");
      navigate({ to: "/wyprawa/$id", params: { id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się zapisać zmian");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Odwołać tę wyprawę? Tej operacji nie można cofnąć.")) return;
    setBusy(true);
    try {
      await deleteRide(id);
      await queryClient.invalidateQueries({ queryKey: ridesQueryKey });
      toast.success("Wyprawa odwołana");
      navigate({ to: "/profil" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się usunąć wyprawy");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-4xl text-foreground">Edytuj wyprawę</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Zmiany od razu zobaczy cała ekipa zapisana na trasę.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <Field name="title" label="Nazwa wyprawy" value={title} onChange={setTitle} />
        <div className="grid grid-cols-2 gap-3">
          <Field name="start" label="Zbiórka" value={start} onChange={setStart} />
          <Field name="end" label="Cel" value={end} onChange={setEnd} />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <RoutePrefsPicker prefs={prefs} onChange={setPrefs} />
          <button
            type="button"
            onClick={handleSavePrefs}
            disabled={savingPrefs}
            className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-primary underline-offset-4 hover:underline disabled:opacity-60"
          >
            {savingPrefs ? "Zapisuję…" : "Zapisz jako moje domyślne"}
          </button>
          <button
            type="button"
            onClick={handlePlanRoute}
            disabled={planning}
            className="mt-3 w-full rounded-md border border-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
          >
            {planning ? "Liczę trasę…" : "Przelicz trasę w Google Maps"}
          </button>
          {start.length > 1 && end.length > 1 && (
            <RouteMap start={start} end={end} prefs={prefs} className="mt-3" />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field name="date" label="Data" type="date" value={date} onChange={setDate} />
          <Field name="time" label="Godzina" type="time" value={time} onChange={setTime} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field name="km" label="Dystans (km)" type="number" value={km} onChange={setKm} />
          <Field name="spots" label="Miejsca" type="number" value={spots} onChange={setSpots} />
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Interkom
          </span>
          <div className="mt-2 flex gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setIntercom(v)}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  intercom === v
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50"
                }`}
              >
                {v ? "Tak" : "Nie"}
              </button>
            ))}
          </div>
          {intercom && (
            <div className="mt-3">
              <label
                htmlFor="intercomType"
                className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Rodzaj interkomu
              </label>
              <input
                id="intercomType"
                value={intercomType}
                onChange={(e) => setIntercomType(e.target.value)}
                placeholder="Cardo Packtalk Edge / Sena 50S"
                className="input-moto mt-1"
              />
            </div>
          )}
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
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={4}
            className="input-moto mt-1"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-ember transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Zapisuję…" : "Zapisz zmiany"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="w-full rounded-md border border-destructive px-5 py-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-60"
        >
          Odwołaj wyprawę
        </button>
      </form>
    </main>
  );
}

function Field({
  name,
  label,
  type = "text",
  value,
  onChange,
}: {
  name: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-moto mt-1"
      />
    </div>
  );
}