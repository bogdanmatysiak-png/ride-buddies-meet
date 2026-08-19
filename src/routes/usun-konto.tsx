import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useSession } from "@/hooks/useAuth";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";

export const Route = createFileRoute("/usun-konto")({
  head: () => ({
    meta: [
      { title: "Usunięcie konta i danych — Motor Trip" },
      {
        name: "description",
        content:
          "Jak trwale usunąć konto Motor Trip i wszystkie swoje dane: profil, wyprawy, zdjęcia, grupy i powiadomienia.",
      },
      { property: "og:title", content: "Usunięcie konta i danych — Motor Trip" },
      {
        property: "og:description",
        content: "Opis procesu trwałego usunięcia konta Motor Trip oraz wszystkich danych.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  const { session, loading } = useSession();
  const [open, setOpen] = useState(false);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-4xl text-foreground">Usunięcie konta i danych</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Możesz w każdej chwili trwale usunąć konto Motor Trip razem ze wszystkimi swoimi danymi.
        Usunięcie jest natychmiastowe i nieodwracalne.
      </p>

      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">Co zostanie usunięte</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground">
          <li>profil (nick, motocykl, miasto, interkom), preferencje trasy i powiadomień</li>
          <li>wyprawy, które prowadzisz, wraz z zapisami uczestników, ocenami i czatem</li>
          <li>Twoje wiadomości i zdjęcia z czatów wypraw i grup</li>
          <li>członkostwa w grupach oraz wysłane i otrzymane zaproszenia</li>
          <li>powiadomienia, alerty o wyprawach w okolicy, zgłoszenia fotoradarów</li>
          <li>konto logowania — po usunięciu nie da się zalogować tym adresem e-mail</li>
        </ul>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">Twoje grupy</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Jeśli jesteś właścicielem grupy, w której jest moderator, przed usunięciem konta wskazujesz
          moderatora, który przejmie własność grupy. Grupa właściciela bez moderatora zostaje
          trwale usunięta razem z jej członkostwami, zaproszeniami i czatem — wymaga to osobnego
          potwierdzenia. Żadna grupa nie zostaje bez właściciela.
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">Jak to zrobić</h2>
        {loading && <p className="mt-3 text-sm text-muted-foreground">Sprawdzam sesję…</p>}
        {!loading && session && (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              Jesteś zalogowany — możesz rozpocząć usuwanie konta tutaj albo w{" "}
              <Link to="/profil" className="font-semibold text-primary">
                profilu
              </Link>
              , w sekcji „Strefa konta”.
            </p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-4 rounded-md bg-destructive px-5 py-3 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90"
            >
              Usuń konto i wszystkie moje dane
            </button>
          </>
        )}
        {!loading && !session && (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              Aby usunąć konto, zaloguj się na nie i wróć na tę stronę.
            </p>
            <Link
              to="/auth"
              className="mt-4 inline-flex rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Zaloguj się
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              Nie masz dostępu do konta? Skorzystaj z opcji odzyskiwania hasła na ekranie logowania.
              Jeśli to nie pomoże, napisz z adresu e-mail przypisanego do konta na{" "}
              <a href="mailto:kontakt@apptrip.motorcycles" className="font-semibold text-primary">
                kontakt@apptrip.motorcycles
              </a>{" "}
              z tematem „Usunięcie konta”. Ze względów bezpieczeństwa nie potwierdzamy w
              korespondencji, czy dane konto istnieje, ani nie ujawniamy żadnych danych — wniosek
              realizujemy tylko po weryfikacji dostępu do adresu e-mail konta.
            </p>
          </>
        )}
      </section>

      {open && <DeleteAccountDialog onClose={() => setOpen(false)} />}
    </main>
  );
}
