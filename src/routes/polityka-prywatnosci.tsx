import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/polityka-prywatnosci")({
  head: () => ({
    meta: [
      { title: "Polityka prywatności — AppTrip" },
      {
        name: "description",
        content:
          "Polityka prywatności AppTrip (Motor Trip). Dowiedz się, jak przetwarzamy Twoje dane, kiedy używamy lokalizacji i jak możesz usunąć konto.",
      },
      { property: "og:title", content: "Polityka prywatności — AppTrip" },
      {
        property: "og:description",
        content:
          "Polityka prywatności AppTrip (Motor Trip).",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-4xl text-foreground">Polityka prywatności</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Ostatnia aktualizacja: <strong className="text-foreground">21 sierpnia 2026 r.</strong>
      </p>

      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">Administrator danych</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Administratorem Twoich danych osobowych jest <strong className="text-foreground">AppTrip</strong>{" "}
          (operator aplikacji Motor Trip / AppTrip). Kontakt w sprawach danych:
          <a
            href="mailto:kontakt@apptrip.motorcycles"
            className="ml-1 font-semibold text-primary"
          >
            kontakt@apptrip.motorcycles
          </a>
          .
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">Cele przetwarzania danych</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>utworzenie i obsługa konta użytkownika,</li>
          <li>logowanie i uwierzytelnianie w aplikacji,</li>
          <li>publikowanie i udział we wspólnych wyprawach motocyklowych,</li>
          <li>komunikacja z użytkownikami oraz obsługa zgłoszeń,</li>
          <li>zapewnienie bezpieczeństwa i stabilności serwisu.</li>
        </ul>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">Kategorie danych</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Dane konta:</strong> adres e-mail, identyfikator użytkownika,
            data utworzenia konta.
          </li>
          <li>
            <strong className="text-foreground">Dane profilu:</strong> nick, zdjęcie, opis, motocykl, miasto,
            rodzaj interkomu.
          </li>
          <li>
            <strong className="text-foreground">Treści dodawane przez użytkownika:</strong> wyprawy, wpisy na czacie,
            zdjęcia, grupy, oceny, zgłoszenia fotoradarów.
          </li>
          <li>
            <strong className="text-foreground">Dane techniczne i analityczne:</strong> adres IP, dane przeglądarki,
            informacje o błędach oraz statystyki użytkowania (anonimizowane w miarę możliwości).
          </li>
        </ul>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">Lokalizacja GPS</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Dane o lokalizacji przetwarzamy wyłącznie wtedy, gdy udzielisz na to wyraźnej zgody.
          Są one używane tylko w zakresie niezbędnym do działania funkcji aplikacji, takich jak
          wyszukiwanie wypraw w okolicy, określenie odległości do zbiórki czy wskazanie pozycji na mapie.
          Możesz w każdej chwili cofnąć zgodę w ustawieniach przeglądarki lub urządzenia.
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">Przechowywanie i ochrona danych</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Twoje dane są przechowywane w chmurowej bazie danych z dostępem ograniczonym tylko do uprawnionych usług.
          Stosujemy szyfrowane połączenia (TLS), mechanizmy kontroli dostępu na poziomie wierszy (RLS)
          oraz regularne aktualizacje zabezpieczeń. Nie udostępniamy danych osobowych innym podmiotom
          poza zaufanymi dostawcami usług niezbędnych do działania aplikacji (np. dostawca map, poczty e-mail).
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">Twoje prawa i usuwanie konta</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Masz prawo dostępu do swoich danych, ich sprostowania, ograniczenia przetwarzania oraz usunięcia.
          Konto wraz ze wszystkimi danymi aplikacyjnymi możesz trwale usunąć samodzielnie w sekcji profilu
          lub pod adresem{" "}
          <a href="/usun-konto" className="font-semibold text-primary">
            /usun-konto
          </a>
          . Usunięcie jest nieodwracalne i obejmuje profil, wyprawy, czaty, grupy oraz zdjęcia.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          W sprawach związanych z danymi osobowymi skontaktuj się z nami pod adresem{" "}
          <a href="mailto:kontakt@apptrip.motorcycles" className="font-semibold text-primary">
            kontakt@apptrip.motorcycles
          </a>
          .
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">Kontakt</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          AppTrip
          <br />
          E-mail:{" "}
          <a href="mailto:kontakt@apptrip.motorcycles" className="font-semibold text-primary">
            kontakt@apptrip.motorcycles
          </a>
        </p>
      </section>
    </main>
  );
}
