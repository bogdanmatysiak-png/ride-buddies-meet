import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  average,
  deleteRating,
  fetchRatings,
  formatScore,
  ratingsQueryKey,
  rateRide,
} from "@/lib/ratings";
import { Stars } from "@/components/Stars";

export function RideRatings({
  rideId,
  hostName,
  hostId,
  currentUserId,
  isAdmin,
}: {
  rideId: string;
  hostName: string;
  hostId?: string | null | undefined;
  currentUserId?: string | null | undefined;
  isAdmin?: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: all = [], isLoading } = useQuery({
    queryKey: ratingsQueryKey,
    queryFn: fetchRatings,
  });
  const ratings = all.filter((r) => r.rideId === rideId);
  const avg = average(ratings.map((r) => r.score));
  const own = currentUserId ? ratings.find((r) => r.userId === currentUserId) : undefined;

  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (own) {
      setScore(own.score);
      setComment(own.comment);
    }
  }, [own?.id]);

  const isHost = !!currentUserId && currentUserId === hostId;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId || score < 1) return;
    setBusy(true);
    try {
      await rateRide(rideId, currentUserId, score, comment.trim());
      await queryClient.invalidateQueries({ queryKey: ratingsQueryKey });
      toast.success("Dzięki za ocenę!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się zapisać oceny");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl text-foreground">Oceny trasy</h2>
        <Link to="/ranking" className="text-xs font-semibold uppercase tracking-wider text-primary">
          Ranking
        </Link>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Stars value={avg} />
        <span className="text-sm font-semibold text-foreground">
          {ratings.length > 0 ? `${formatScore(avg)} / 5` : "brak ocen"}
        </span>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          ({ratings.length})
        </span>
      </div>

      <ul className="mt-4 space-y-3">
        {isLoading && <li className="text-sm text-muted-foreground">Ładujemy oceny…</li>}
        {ratings.map((r) => (
          <li key={r.id} className="rounded-lg border border-border px-3 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-primary">
                {r.userId === currentUserId ? "Ty" : r.nick}
              </span>
              <span className="flex items-center gap-2">
                <Stars value={r.score} />
                {(r.userId === currentUserId || isAdmin) && (
                  <button
                    type="button"
                    aria-label="Usuń ocenę"
                    onClick={async () => {
                      try {
                        await deleteRating(r.id);
                        await queryClient.invalidateQueries({ queryKey: ratingsQueryKey });
                      } catch {
                        toast.error("Nie udało się usunąć oceny");
                      }
                    }}
                    className="text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            </div>
            {r.comment && (
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {r.comment}
              </p>
            )}
          </li>
        ))}
      </ul>

      {!currentUserId ? (
        <Link
          to="/auth"
          search={{ redirect: `/wyprawa/${rideId}` }}
          className="mt-4 inline-block text-sm font-semibold text-primary"
        >
          Zaloguj się, aby ocenić trasę
        </Link>
      ) : isHost ? (
        <p className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">
          Prowadzisz tę wyprawę — ocenia ją ekipa
        </p>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3 border-t border-border pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {own ? "Zmień swoją ocenę" : `Oceń trasę i prowadzącego (${hostName})`}
          </p>
          <Stars value={score} size="lg" onChange={setScore} />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Jak było na trasie?"
            className="input-moto resize-none"
          />
          <button
            type="submit"
            disabled={busy || score < 1}
            className="w-full rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-ember transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {own ? "Zapisz ocenę" : "Wyślij ocenę"}
          </button>
        </form>
      )}
    </section>
  );
}