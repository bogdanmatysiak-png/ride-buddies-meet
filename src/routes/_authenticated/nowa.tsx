import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createRide, levelLabel, ridesQueryKey, type RideLevel } from "@/lib/rides";
import { fetchMyGroups, groupsQueryKey } from "@/lib/groups";
import { GroupPicker } from "@/components/GroupPicker";
import { RouteMap } from "@/components/RouteMap";
import { RouteWeather } from "@/components/RouteWeather";
import { cameraSourcesText } from "@/lib/camera-sources";
import { RoutePrefsPicker } from "@/components/RoutePrefsPicker";
import { WaypointsEditor } from "@/components/WaypointsEditor";
import { PlaceSearchInput } from "@/components/PlaceSearchInput";
import { RoutePlaceHints } from "@/components/RoutePlaceHints";
import { useLiveRoute } from "@/hooks/useLiveRoute";
import { useOptimizeWaypoints } from "@/hooks/useOptimizeWaypoints";
import {
  defaultRoutePrefs,
  prefsFromProfile,
  prefsSummary,
  saveRoutePrefs,
  type RoutePrefs,
} from "@/lib/route-prefs";
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
  const [intercom, setIntercom] = useState(false);
  const [intercomType, setIntercomType] = useState("");
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [waypoints, setWaypoints] = useState<string[]>([]);
  const [km, setKm] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [spots, setSpots] = useState("10");
  const [unlimitedSpots, setUnlimitedSpots] = useState(false);
  const [prefs, setPrefs] = useState<RoutePrefs>(defaultRoutePrefs);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const { data: groups = [] } = useQuery({
    queryKey: [...groupsQueryKey, user?.id],
    queryFn: () => fetchMyGroups(user!.id),
    enabled: !!user,
  });
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
    if (plan) setKm(String(plan.km));
  }, [plan]);

  useEffect(() => {
    if (profile) setPrefs(prefsFromProfile(profile));
  }, [profile]);

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
                waypoints,
                date: String(f.get("date")),
                time: String(f.get("time")),
                km: Number(f.get("km")),
                durationMinutes: plan?.minutes ?? null,
                spots: unlimitedSpots ? 0 : Number(f.get("spots")),
                description: String(f.get("description")),
                level,
                intercom,
                intercomType: intercomType.trim(),
                groupId,
                encodedPolyline: plan?.encodedPolyline ?? null,
                cameras: plan?.cameras ?? null,
                sectionChecks: plan?.sectionChecks ?? null,
                cameraSources: plan?.cameraSources ?? [],
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
        <Field
          name="title"
          label="Nazwa wyprawy (opcjonalnie)"
          placeholder="Serpentyny w Beskidach"
          optional
        />
        <p className="-mt-2 text-xs text-muted-foreground">
          Pusto? Nadamy nazwę automatycznie: „{profile?.nick ?? "Twój nick"} zapraszam na wyprawę
          numer …”.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field
            name="start"
            label="Zbiórka"
            placeholder="Kraków"
            value={start}
            onChange={setStart}
            search
          />
          <Field name="end" label="Cel" placeholder="Zakopane" value={end} onChange={setEnd} search />
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
          <RoutePlaceHints
            start={start}
            end={end}
            waypoints={waypoints}
            error={planError}
            onStartChange={setStart}
            onEndChange={setEnd}
            onWaypointsChange={setWaypoints}
          />
          {plan && (
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                {plan.km} km · ok. {Math.floor(plan.minutes / 60)} h {plan.minutes % 60} min jazdy
                {" · "}
                {plan.turns} zakrętów · {prefsSummary(prefs)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {plan.cameras === null && plan.sectionChecks === null
                  ? "Fotoradary: brak danych dla tej trasy"
                  : `Fotoradary: ${plan.cameras ?? 0} · odcinkowe pomiary prędkości: ${plan.sectionChecks ?? 0} (źródła: ${cameraSourcesText(plan.cameraSources)})`}
              </p>
              <RouteMap
                start={plan.startAddress}
                end={plan.endAddress}
                waypoints={plan.waypoints}
                prefs={prefs}
                className="mt-3"
              />
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field name="date" label="Data" type="date" value={date} onChange={setDate} />
          <Field name="time" label="Godzina" type="time" value={time} onChange={setTime} />
        </div>
        <RouteWeather
          encodedPolyline={plan?.encodedPolyline ?? null}
          date={date}
          time={time}
          minutes={plan?.minutes ?? 0}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            name="km"
            label="Dystans (km)"
            type="number"
            placeholder="220"
            value={km}
            onChange={setKm}
          />
          <div>
            <Field
              name="spots"
              label="Miejsca"
              type="number"
              placeholder={unlimitedSpots ? "bez limitu" : "12"}
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
            name="description"
            required
            rows={4}
            placeholder="Tempo, postoje, tankowanie, wymagane opony..."
            className="input-moto mt-1"
          />
        </div>

        <GroupPicker groups={groups} value={groupId} onChange={setGroupId} disabled={busy} />

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
  disabled,
  search,
  optional,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  search?: boolean;
  optional?: boolean;
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
          placeholder={placeholder}
          required={!disabled}
          disabled={disabled}
          className="mt-1"
        />
      ) : (
      <input
        id={name}
        name={name}
        type={type}
        required={!disabled && !optional}
        disabled={disabled}
        placeholder={placeholder}
        {...(onChange ? { value: value ?? "", onChange: (e) => onChange(e.target.value) } : {})}
        className="input-moto mt-1"
      />
      )}
    </div>
  );
}