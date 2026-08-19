import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getAccountDeletionPlan, deleteMyAccount } from "@/lib/account.functions";
import type { AccountDeletionPlan } from "@/lib/account.functions";

const CONFIRM_WORD = "USUŃ";

export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const loadPlan = useServerFn(getAccountDeletionPlan);
  const runDelete = useServerFn(deleteMyAccount);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [plan, setPlan] = useState<AccountDeletionPlan | null>(null);
  const [planError, setPlanError] = useState(false);
  const [transfers, setTransfers] = useState<Record<string, string>>({});
  const [orphanOk, setOrphanOk] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    loadPlan({})
      .then((p) => {
        if (alive) setPlan(p);
      })
      .catch(() => {
        if (alive) setPlanError(true);
      });
    return () => {
      alive = false;
    };
  }, [loadPlan]);

  const needsTransfer = plan?.groupsWithModerators ?? [];
  const orphans = plan?.groupsWithoutModerator ?? [];

  const ready = useMemo(() => {
    if (!plan) return false;
    if (word.trim() !== CONFIRM_WORD) return false;
    if (needsTransfer.some((g) => !transfers[g.groupId])) return false;
    if (orphans.length > 0 && !orphanOk) return false;
    return true;
  }, [plan, word, needsTransfer, transfers, orphans.length, orphanOk]);

  async function confirmDelete() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await runDelete({
        data: {
          transfers: needsTransfer.map((g) => ({
            groupId: g.groupId,
            newOwnerUserId: transfers[g.groupId]!,
          })),
          confirmDeleteOrphanGroups: orphans.length > 0 ? orphanOk : false,
        },
      });
      await supabase.auth.signOut();
      queryClient.clear();
      try {
        localStorage.clear();
      } catch {
        /* brak dostępu do localStorage — pomijamy */
      }
      toast.success("Konto i wszystkie Twoje dane zostały trwale usunięte.");
      navigate({ to: "/auth", replace: true });
    } catch {
      setBusy(false);
      toast.error(
        "Nie udało się usunąć konta. Nic nie zostało zmienione — spróbuj ponownie za chwilę.",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-destructive/50 bg-card p-5 shadow-xl">
        <h2 id="delete-account-title" className="text-2xl text-foreground">
          Trwale usunąć konto?
        </h2>
        <p className="mt-2 text-sm text-destructive">
          Operacja jest trwała i nieodwracalna. Nie da się jej cofnąć ani odzyskać danych.
        </p>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Usuniemy
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
          <li>profil, preferencje trasy i ustawienia powiadomień</li>
          <li>wyprawy, które prowadzisz, wraz z zapisami, ocenami i czatem</li>
          <li>Twoje zdjęcia z czatów</li>
          <li>członkostwa w grupach oraz wysłane i otrzymane zaproszenia</li>
          <li>powiadomienia, alerty o wyprawach w okolicy i zgłoszenia fotoradarów</li>
          <li>wszystkie inne dane należące wyłącznie do Ciebie</li>
        </ul>

        {planError && (
          <p className="mt-4 rounded-md border border-border p-3 text-sm text-muted-foreground">
            Nie udało się sprawdzić Twoich grup. Odśwież stronę i spróbuj ponownie.
          </p>
        )}

        {!plan && !planError && (
          <p className="mt-4 text-sm text-muted-foreground">Sprawdzam Twoje grupy…</p>
        )}

        {needsTransfer.length > 0 && (
          <div className="mt-5 rounded-md border border-border p-4">
            <p className="text-sm font-semibold text-foreground">
              Przekaż własność grup nowemu właścicielowi
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Wybierz moderatora dla każdej grupy. Po przekazaniu przestaniesz być jej członkiem.
            </p>
            <div className="mt-3 space-y-3">
              {needsTransfer.map((g) => (
                <label key={g.groupId} className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.name}
                  </span>
                  <select
                    value={transfers[g.groupId] ?? ""}
                    onChange={(e) =>
                      setTransfers((prev) => ({ ...prev, [g.groupId]: e.target.value }))
                    }
                    className="input-moto mt-1"
                  >
                    <option value="">— wybierz moderatora —</option>
                    {g.moderators.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.nick}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}

        {orphans.length > 0 && (
          <div className="mt-5 rounded-md border border-destructive/60 p-4">
            <p className="text-sm font-semibold text-destructive">
              Grupy bez moderatora zostaną usunięte
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm text-foreground">
              {orphans.map((g) => (
                <li key={g.groupId}>{g.name}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Razem z grupą trwale znikną jej członkostwa, zaproszenia, czat i dane należące
              wyłącznie do tej grupy.
            </p>
            <label className="mt-3 flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={orphanOk}
                onChange={(e) => setOrphanOk(e.target.checked)}
                className="mt-1 h-4 w-4 accent-primary"
              />
              Rozumiem i potwierdzam usunięcie tych grup.
            </label>
          </div>
        )}

        <label className="mt-5 block">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Wpisz {CONFIRM_WORD}, aby potwierdzić
          </span>
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder={CONFIRM_WORD}
            className="input-moto mt-1"
            autoComplete="off"
          />
        </label>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={confirmDelete}
            disabled={!ready || busy}
            className="rounded-md bg-destructive px-5 py-3 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Usuwam konto…" : "Trwale usuń konto"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-border px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/60 disabled:opacity-50"
          >
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}
