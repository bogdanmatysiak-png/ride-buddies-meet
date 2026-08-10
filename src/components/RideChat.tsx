import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ImagePlus, MessageCircle, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteRideMessage,
  fetchRideMessages,
  formatMessageTime,
  rideMessagesQueryKey,
  sendRideMessage,
  uploadChatPhoto,
} from "@/lib/chat";

export function RideChat({
  rideId,
  currentUserId,
  hostId,
  isAdmin,
}: {
  rideId: string;
  currentUserId?: string | null | undefined;
  hostId?: string | null | undefined;
  isAdmin?: boolean;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: rideMessagesQueryKey(rideId),
    queryFn: () => fetchRideMessages(rideId),
  });

  useEffect(() => {
    const channel = supabase
      .channel(`ride-messages-${rideId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ride_messages",
          filter: `ride_id=eq.${rideId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: rideMessagesQueryKey(rideId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [rideId, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId || (!text.trim() && !photo)) return;
    setSending(true);
    try {
      let imagePath: string | null = null;
      if (photo) imagePath = await uploadChatPhoto(currentUserId, photo);
      await sendRideMessage(rideId, currentUserId, text, imagePath);
      setText("");
      clearPhoto();
      await queryClient.invalidateQueries({ queryKey: rideMessagesQueryKey(rideId) });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nie udało się wysłać wiadomości",
      );
    } finally {
      setSending(false);
    }
  }

  function clearPhoto() {
    setPhoto(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section id="czat" className="mt-4 rounded-lg border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-2xl text-foreground">
        <MessageCircle className="h-5 w-5 text-primary" />
        Ustalenia ekipy
      </h2>
      <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
        Dogadajcie zbiórkę, tempo i przerwy na paliwo
      </p>

      <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Ładujemy wiadomości…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Cisza w eterze. Napisz pierwszy i ustal szczegóły.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.userId === currentUserId;
            const canDelete =
              mine || !!isAdmin || (!!currentUserId && currentUserId === hostId);
            return (
              <div
                key={m.id}
                className={`group rounded-lg border border-border px-3 py-2 ${
                  mine ? "bg-secondary" : "bg-transparent"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-primary">
                    {mine ? "Ty" : m.nick}
                  </span>
                  <span className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                    {formatMessageTime(m.createdAt)}
                    {canDelete && (
                      <button
                        type="button"
                        aria-label="Usuń wiadomość"
                        onClick={async () => {
                          try {
                            await deleteRideMessage(m.id);
                            await queryClient.invalidateQueries({
                              queryKey: rideMessagesQueryKey(rideId),
                            });
                          } catch {
                            toast.error("Nie udało się usunąć wiadomości");
                          }
                        }}
                        className="opacity-60 transition-opacity hover:text-primary group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
                {m.body && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                    {m.body}
                  </p>
                )}
                {m.imageUrl && (
                  <a href={m.imageUrl} target="_blank" rel="noreferrer">
                    <img
                      src={m.imageUrl}
                      alt="Zdjęcie od ekipy"
                      loading="lazy"
                      className="mt-2 max-h-64 w-auto rounded-md border border-border object-cover"
                    />
                  </a>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {currentUserId ? (
        <form onSubmit={submit} className="mt-4 flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(e);
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder="Napisz do ekipy…"
            className="input-moto min-h-[44px] flex-1 resize-none"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-ember transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Wyślij
          </button>
        </form>
      ) : (
        <Link
          to="/auth"
          search={{ redirect: `/wyprawa/${rideId}` }}
          className="mt-4 inline-block text-sm font-semibold text-primary"
        >
          Zaloguj się, aby pisać z ekipą
        </Link>
      )}
    </section>
  );
}