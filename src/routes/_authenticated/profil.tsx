import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useProfile, useSession } from "@/hooks/useAuth";
import { fetchRides, ridesQueryKey } from "@/lib/rides";
import { RideCard } from "@/components/RideCard";
import { RoutePrefsPicker } from "@/components/RoutePrefsPicker";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";
import {
  defaultRoutePrefs,
  prefsFromProfile,
  prefsToProfile,
  type RoutePrefs,
} from "@/lib/route-prefs";

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({
    meta: [
      { title: "Mój profil motocyklisty — Motor Trip" },
      {
        name: "description",
        content: "Ustaw nick, motocykl i miasto oraz sprawdź wyprawy, na które jesteś zapisany.",
      },
      { property: "og:title", content: "Mój profil motocyklisty — Motor Trip" },
      { property: "og:description", content: "Twój nick, motocykl i zapisane wyprawy." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useProfile(user?.id);
  const { data: rides = [] } = useQuery({ queryKey: ridesQueryKey, queryFn: fetchRides });
  const isAdmin = useIsAdmin(user?.id);

  const [nick, setNick] = useState("");
  const [bike, setBike] = useState("");
  const [city, setCity] = useState("");
  const [intercom, setIntercom] = useState(false);
  const [intercomType, setIntercomType] = useState("");
  const [meshSupported, setMeshSupported] = useState(false);
  const [prefs, setPrefs] = useState<RoutePrefs>(defaultRoutePrefs);
  const [notifyInvite, setNotifyInvite] = useState(true);
  const [notifyAccepted, setNotifyAccepted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (profile) {
      setNick(profile.nick);
      setBike(profile.bike ?? "");
      setCity(profile.city ?? "");
      setIntercom(profile.intercom);
      setIntercomType(profile.intercom_type);
      setMeshSupported(profile.mesh_supported === true);
      setPrefs(prefsFromProfile(profile));
      setNotifyInvite(profile.notify_group_invite);
      setNotifyAccepted(profile.notify_group_accepted);
    } else if (user && !isLoading) {
      setNick((user.user_metadata?.["nick"] as string) ?? user.email?.split("@")[0] ?? "");
    }
  }, [profile, user, isLoading]);

  const mine = rides.filter((r) => user && r.riderIds.includes(user.id));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          nick,
          bike: bike || null,
          city: city || null,
          intercom,
          intercom_type: intercom ? intercomType.trim() : "",
          mesh_supported: intercom ? meshSupported : false,
          ...prefsToProfile(prefs),
          notify_group_invite: notifyInvite,
          notify_group_accepted: notifyAccepted,
        },
        { onConflict: "id" },
      );
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
    await queryClient.invalidateQueries({ queryKey: ridesQueryKey });
    toast.success("Profil zapisany");
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-4xl text-foreground">Twój profil</h1>
      <p className="mt-2 text-sm text-muted-foreground">{user?.email}</p>
      {isAdmin && (
        <p className="mt-2 inline-block rounded-sm bg-primary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground">
          Administrator
        </p>
      )}

      <form onSubmit={save} className="mt-6 space-y-4 rounded-lg border border-border bg-card p-5">
        <Labeled label="Nick">
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            required
            className="input-moto"
          />
        </Labeled>
        <Labeled label="Motocykl">
          <input
            value={bike}
            onChange={(e) => setBike(e.target.value)}
            placeholder="Yamaha Ténéré 700"
            className="input-moto"
          />
        </Labeled>
        <Labeled label="Miasto">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Kraków"
            className="input-moto"
          />
        </Labeled>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Interkom
          </span>
          <div className="mt-2 flex gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => {
                  setIntercom(v);
                  if (!v) {
                    setIntercomType("");
                    setMeshSupported(false);
                  }
                }}
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
            <>
              <input
                value={intercomType}
                onChange={(e) => setIntercomType(e.target.value)}
                placeholder="Cardo Packtalk Edge / Sena 50S"
                className="input-moto mt-3"
              />
              <div className="mt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Obsługa MESH
                </span>
                <div className="mt-2 flex gap-2">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      aria-pressed={meshSupported === v}
                      onClick={() => setMeshSupported(v)}
                      className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                        meshSupported === v
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {v ? "Tak" : "Nie"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <div>
          <RoutePrefsPicker
            prefs={prefs}
            onChange={setPrefs}
            title="Domyślne preferencje trasy"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Te ustawienia podstawiają się automatycznie, gdy wyznaczasz trasę nowej wyprawy.
          </p>
        </div>
        <fieldset className="rounded-md border border-border p-4">
          <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Powiadomienia
          </legend>
          <label className="flex items-start gap-3 py-1">
            <input
              type="checkbox"
              checked={notifyInvite}
              onChange={(e) => setNotifyInvite(e.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span className="text-sm text-foreground">
              Zaproszenia do grup
              <span className="block text-xs text-muted-foreground">
                Gdy ktoś zaprasza Cię do grupy albo anuluje zaproszenie.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 py-1">
            <input
              type="checkbox"
              checked={notifyAccepted}
              onChange={(e) => setNotifyAccepted(e.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span className="text-sm text-foreground">
              Odpowiedzi na Twoje zaproszenia
              <span className="block text-xs text-muted-foreground">
                Gdy zaproszona osoba zaakceptuje albo odrzuci zaproszenie do Twojej grupy.
              </span>
            </span>
          </label>
        </fieldset>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-ember transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          Zapisz profil
        </button>
      </form>

      <h2 className="mt-10 text-3xl text-foreground">Twoje wyprawy</h2>
      <div className="mt-4 space-y-3">
        {mine.map((ride) => (
          <div key={ride.id}>
            <RideCard ride={ride} currentUserId={user?.id ?? null} />
            {user && (ride.hostId === user.id || isAdmin) && (
              <Link
                to="/edytuj/$id"
                params={{ id: ride.id }}
                className="mt-2 inline-flex rounded-md border border-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                Edytuj trasę
              </Link>
            )}
          </div>
        ))}
        {mine.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nie jesteś jeszcze zapisany na żadną wyprawę.{" "}
            <Link to="/" className="font-semibold text-primary">
              Przejrzyj trasy
            </Link>
          </p>
        )}
      </div>

      <section className="mt-14 rounded-lg border border-destructive/60 bg-card p-5">
        <h2 className="text-2xl text-destructive">Strefa konta</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Trwałe usunięcie konta razem z profilem, prowadzonymi wyprawami, zdjęciami, członkostwami
          i zaproszeniami do grup oraz powiadomieniami. Operacji nie da się cofnąć.{" "}
          <Link to="/usun-konto" className="font-semibold text-primary">
            Dowiedz się więcej
          </Link>
        </p>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="mt-4 rounded-md bg-destructive px-5 py-3 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90"
        >
          Usuń konto i wszystkie moje dane
        </button>
      </section>

      {deleteOpen && <DeleteAccountDialog onClose={() => setDeleteOpen(false)} />}
    </main>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}