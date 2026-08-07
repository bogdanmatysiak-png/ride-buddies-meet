import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deleteRide,
  fetchRides,
  levelLabel,
  ridesQueryKey,
  updateRide,
  type RideLevel,
} from "@/lib/rides";
import { RouteMap } from "@/components/RouteMap";
import { RoutePrefsPicker } from "@/components/RoutePrefsPicker";
import { WaypointsEditor } from "@/components/WaypointsEditor";
import { PlaceSearchInput } from "@/components/PlaceSearchInput";
import { useLiveRoute } from "@/hooks/useLiveRoute";
import { useOptimizeWaypoints } from "@/hooks/useOptimizeWaypoints";
import {
  defaultRoutePrefs,
  prefsFromProfile,
  prefsSummary,
  saveRoutePrefs,
  type RoutePrefs,
} from "@/lib/route-prefs";
import { useIsAdmin, useProfile, useSession } from "@/hooks/useAuth";
import { rideMessagesQueryKey, sendRideUpdateNotice } from "@/lib/chat";
import { notifyRideParticipants } from "@/lib/notifications";

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
  const [waypoints, setWaypoints] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [km, setKm] = useState("");
  const [spots, setSpots] = useState("");
  const [unlimitedSpots, setUnlimitedSpots] = useState(false);
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<RideLevel>("chill");
  const [intercom, setIntercom] = useState(false);
  const [intercomType, setIntercomType] = useState("");
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<RoutePrefs>(defaultRoutePrefs);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [recalculated, setRecalculated] = useState<string | null>(null);
  const { plan, planning, error: planError, recalc } = useLiveRoute({
    start,
    end,
    waypoints,
    prefs,
  });
  const { optimize, optimizing, canOptimize, mode, setMode, comparison } = useOptimizeWaypoints({
    start,
    end,
    waypoints,
    prefs,
    onChange: setWaypoints,
  });

  useEffect(() => {
    if (!plan) return;
    setKm(String(plan.km));
    setRecalculated(prefsSummary(prefs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  useEffect(() => {
    if (profile) setPrefs(prefsFromProfile(profile));
  }, [profile]);

  useEffect(() => {
    if (!ride) return;
    setTitle(ride.title);
    setStart(ride.start);
    setEnd(ride.end);
    setWaypoints(ride.waypoints ?? []);
    setDate(ride.date);
    setTime(ride.time);
    setKm(String(ride.km));
    setUnlimitedSpots(ride.spots <= 0);
    setSpots(ride.spots > 0 ? String(ride.spots) : "");
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
      const prev = ride;
      if (prev && (start.trim() !== prev.start || end.trim() !== prev.end)) {
        changes.push(`nowa trasa: ${start.trim()} → ${end.trim()}`);
      }
      if (prev && waypoints.join("|") !== (prev.waypoints ?? []).join("|")) {
        changes.push(
          waypoints.length > 0
            ? `punkty przez: ${waypoints.join(" → ")}`
            : "usunięto punkty pośrednie",
        );
      }
      if (prev && Number(km) !== prev.km) {
        changes.push(`dystans: ${prev.km} km → ${Number(km)} km`);
      }
      if (prev && (date !== prev.date || time !== prev.time)) {
        changes.push(`zbiórka: ${date}, ${time}`);
      }
      if (recalculated) {
        changes.push(`preferencje trasy: ${recalculated}`);
      }

      await updateRide(id, {
        title,
        start,
        end,
        waypoints,
        date,
        time,
        km: Number(km),
        spots: unlimitedSpots ? 0 : Number(spots),
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
          const notified = await notifyRideParticipants({
            rideId: id,
            userIds: prev?.riderIds ?? [],
            exceptUserId: user.id,
            title: `Trasa przeliczona: ${title}`,
            body: changes.map((c) => `• ${c}`).join("\n"),
          });
          toast.success(
            notified > 0
              ? `Powiadomiłem ekipę (${notified}) o przeliczonej trasie`
              : "Zmiany ogłoszone na czacie wyprawy",
          );
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
          <Field name="start" label="Zbiórka" value={start} onChange={setStart} search />
          <Field name="end" label="Cel" value={end} onChange={setEnd} search />
        </div>
        {start.trim().length > 1 && end.trim().length > 1 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <WaypointsEditor
              waypoints={waypoints}
              onChange={setWaypoints}
              onOptimize={(m) => void optimize(m)}
              mode={mode}
              onModeChange={setMode}
              optimizing={optimizing}
              canOptimize={canOptimize}
              comparison={comparison}
            />
          </div>
        )}
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
            onClick={() => void recalc()}
            disabled={planning}
            className="mt-3 w-full rounded-md border border-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
          >
            {planning ? "Liczę trasę na żywo…" : "Przelicz trasę teraz"}
          </button>
          {planError && <p className="mt-2 text-xs text-destructive">{planError}</p>}
          {plan && (
            <p className="mt-3 text-sm text-muted-foreground">
              {plan.km} km · ok. {Math.floor(plan.minutes / 60)} h {plan.minutes % 60} min jazdy ·{" "}
              {plan.turns} zakrętów · {prefsSummary(prefs)}
            </p>
          )}
          {start.length > 1 && end.length > 1 && (
            <RouteMap start={start} end={end} waypoints={waypoints} prefs={prefs} className="mt-3" />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field name="date" label="Data" type="date" value={date} onChange={setDate} />
          <Field name="time" label="Godzina" type="time" value={time} onChange={setTime} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field name="km" label="Dystans (km)" type="number" value={km} onChange={setKm} />
          <div>
            <Field
              name="spots"
              label="Miejsca"
              type="number"
              value={unlimitedSpots ? "" : spots}
              onChange={setSpots}
              disabled={unlimitedSpots}
            />
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={unlimitedSpots}
                onChange={(e) => setUnlimitedSpots(e.target.checked)}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              Bez limitu miejsc
            </label>
          </div>
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
  disabled,
  search,
}: {
  name: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  search?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      {search && onChange ? (
        <PlaceSearchInput
          id={name}
          name={name}
          value={value ?? ""}
          onChange={onChange}
          required={!disabled}
          disabled={disabled}
          className="mt-1"
        />
      ) : (
      <input
        id={name}
        name={name}
        type={type}
        required={!disabled}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-moto mt-1"
      />
      )}
    </div>
  );
}