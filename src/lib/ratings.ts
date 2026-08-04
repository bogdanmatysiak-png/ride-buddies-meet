import { supabase } from "@/integrations/supabase/client";

export type RideRating = {
  id: string;
  rideId: string;
  userId: string;
  nick: string;
  score: number;
  comment: string;
  createdAt: string;
};

export const ratingsQueryKey = ["ride_ratings"] as const;

export async function fetchRatings(): Promise<RideRating[]> {
  const [{ data, error }, { data: profiles }] = await Promise.all([
    supabase
      .from("ride_ratings")
      .select("id, ride_id, user_id, score, comment, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, nick"),
  ]);
  if (error) throw error;
  const nickById = new Map((profiles ?? []).map((p) => [p.id, p.nick]));
  return (data ?? []).map((r) => ({
    id: r.id,
    rideId: r.ride_id,
    userId: r.user_id,
    nick: nickById.get(r.user_id) ?? "Motocyklista",
    score: r.score,
    comment: r.comment,
    createdAt: r.created_at,
  }));
}

export async function rateRide(
  rideId: string,
  userId: string,
  score: number,
  comment: string,
) {
  const { error } = await supabase
    .from("ride_ratings")
    .upsert(
      { ride_id: rideId, user_id: userId, score, comment },
      { onConflict: "ride_id,user_id" },
    );
  if (error) throw error;
}

export async function deleteRating(ratingId: string) {
  const { error } = await supabase.from("ride_ratings").delete().eq("id", ratingId);
  if (error) throw error;
}

export function average(scores: number[]) {
  if (scores.length === 0) return 0;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

export function formatScore(value: number) {
  return value.toFixed(1).replace(".", ",");
}