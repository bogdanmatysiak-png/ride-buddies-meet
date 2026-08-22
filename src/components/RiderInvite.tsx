import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, User } from "lucide-react";
import { toast } from "sonner";
import {
  fetchInviteTargets,
  inviteTargetsQueryKey,
  inviteToTeam,
  sentInvitesQueryKey,
  type InviteTarget,
} from "@/lib/groups";

/**
 * Uczestnik w sekcji „Kto jedzie”. Po kliknięciu otwiera małe okno profilu,
 * a właściciel ekipy może z niego wysłać zaproszenie do swojej ekipy.
 * Uprawnienia egzekwuje baza (RLS: INSERT tylko dla właściciela grupy).
 */
export function RiderInvite({
  riderId,
  riderNick,
  currentUserId,
}: {
  riderId: string;
  riderNick: string;
  currentUserId?: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<InviteTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const canInviteSomeone = !!currentUserId && currentUserId !== riderId;

  const { data: targets = [] } = useQuery({
    queryKey: [...inviteTargetsQueryKey, currentUserId, riderId],
    enabled: open && canInviteSomeone,
    queryFn: () => fetchInviteTargets(currentUserId!, riderId),
  });

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirm(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const available = targets.filter((t) => t.state === "available");
  const blocked = targets.filter((t) => t.state !== "available");

  async function send(target: InviteTarget) {
    setBusy(true);
    try {
      await inviteToTeam(target.groupId, riderId, currentUserId!);
      await queryClient.invalidateQueries({ queryKey: sentInvitesQueryKey });
      await queryClient.invalidateQueries({ queryKey: inviteTargetsQueryKey });
      toast.success("Zaproszenie do ekipy zostało wysłane");
      setConfirm(null);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się wysłać zaproszenia");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={boxRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <span
          aria-hidden
          className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold uppercase text-primary"
        >
          {riderNick.slice(0, 2)}
        </span>
        {riderNick}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`Profil ${riderNick}`}
          className="absolute left-0 z-30 mt-2 w-64 rounded-lg border border-border bg-card p-3 shadow-lg"
        >
          <p className="truncate text-sm font-semibold text-foreground">{riderNick}</p>
          <Link
            to="/motocyklista/$id"
            params={{ id: riderId }}
            onClick={() => setOpen(false)}
            className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
          >
            <User className="h-3.5 w-3.5" /> Zobacz profil
          </Link>

          {canInviteSomeone && (
            <div className="mt-3 border-t border-border pt-3">
              {confirm ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Wysłać zaproszenie do ekipy {confirm.groupName} użytkownikowi {riderNick}?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void send(confirm)}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50"
                    >
                      Wyślij
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirm(null)}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:border-primary hover:text-primary"
                    >
                      Anuluj
                    </button>
                  </div>
                </>
              ) : available.length > 0 ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Zaproś do ekipy
                  </p>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                    {available.map((t) => (
                      <li key={t.groupId}>
                        <button
                          type="button"
                          onClick={() => setConfirm(t)}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-secondary hover:text-primary"
                        >
                          <UserPlus className="h-3.5 w-3.5 text-primary" />
                          <span className="truncate">{t.groupName}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : blocked.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {blocked.some((t) => t.state === "member")
                    ? `${riderNick} już należy do Twojej ekipy.`
                    : `${riderNick} ma już aktywne zaproszenie do Twojej ekipy.`}
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
