import { supabase } from "@/integrations/supabase/client";

export type RideMessage = {
  id: string;
  userId: string;
  nick: string;
  body: string;
  createdAt: string;
  imagePath?: string | null;
  imageUrl?: string | null;
};

export const chatPhotoBucket = "chat-photos";

/** Wgrywa zdjęcie do schowka i zwraca ścieżkę pliku. */
export async function uploadChatPhoto(userId: string, file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Wybierz plik graficzny (JPG, PNG, WEBP)");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Zdjęcie może mieć maks. 8 MB");
  }
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(chatPhotoBucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

async function signPhotos(paths: string[]) {
  const urlByPath = new Map<string, string>();
  if (paths.length === 0) return urlByPath;
  const { data } = await supabase.storage
    .from(chatPhotoBucket)
    .createSignedUrls(paths, 60 * 60);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
  }
  return urlByPath;
}

export const rideMessagesQueryKey = (rideId: string) =>
  ["ride-messages", rideId] as const;

export async function fetchRideMessages(rideId: string): Promise<RideMessage[]> {
  const { data, error } = await supabase
    .from("ride_messages")
    .select("id, user_id, body, created_at, image_url")
    .eq("ride_id", rideId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const nickById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nick")
      .in("id", ids);
    for (const p of profiles ?? []) nickById.set(p.id, p.nick);
  }

  const signed = await signPhotos(
    rows.map((r) => r.image_url).filter((p): p is string => !!p),
  );

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    nick: nickById.get(r.user_id) ?? "Motocyklista",
    body: r.body,
    createdAt: r.created_at,
    imagePath: r.image_url,
    imageUrl: r.image_url ? signed.get(r.image_url) ?? null : null,
  }));
}

export async function sendRideMessage(
  rideId: string,
  userId: string,
  body: string,
  imagePath?: string | null,
) {
  const trimmed = body.trim().slice(0, 1000);
  if (!trimmed && !imagePath) return;
  const { error } = await supabase
    .from("ride_messages")
    .insert({ ride_id: rideId, user_id: userId, body: trimmed, image_url: imagePath ?? null });
  if (error) throw error;
}

export async function deleteRideMessage(id: string) {
  const { error } = await supabase.from("ride_messages").delete().eq("id", id);
  if (error) throw error;
}

/** Usuwa samo zdjęcie z wiadomości — treść zostaje. */
export async function removeRideMessagePhoto(id: string, imagePath?: string | null) {
  const { error } = await supabase
    .from("ride_messages")
    .update({ image_url: null })
    .eq("id", id);
  if (error) throw error;
  if (imagePath) {
    await supabase.storage.from(chatPhotoBucket).remove([imagePath]);
  }
}

/** Ogłoszenie prowadzącego na czacie wyprawy — widzą je od razu wszyscy uczestnicy. */
export const rideNoticePrefix = "📣 Aktualizacja trasy:";

export async function sendRideUpdateNotice(
  rideId: string,
  hostId: string,
  changes: string[],
) {
  if (changes.length === 0) return;
  const body = `${rideNoticePrefix}\n${changes.map((c) => `• ${c}`).join("\n")}`;
  await sendRideMessage(rideId, hostId, body);
}

export function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}