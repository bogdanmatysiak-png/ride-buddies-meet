import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useProfile, useSession } from "@/hooks/useAuth";
import { fetchRides, ridesQueryKey } from "@/lib/rides";
import { RideCard } from "@/components/RideCard";

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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setNick(profile.nick);
      setBike(profile.bike ?? "");
      setCity(profile.city ?? "");
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
      .upsert({ id: user.id, nick, bike: bike || null, city: city || null }, { onConflict: "id" });
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