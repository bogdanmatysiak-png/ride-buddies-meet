import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/standardy-bezpieczenstwa-dzieci")({
  head: () => ({
    meta: [
      { title: "Standardy bezpieczeństwa dzieci — MOTO TRIP" },
      {
        name: "description",
        content:
          "Standardy bezpieczeństwa dzieci w aplikacji MOTO TRIP. Zerowa tolerancja dla wykorzystywania seksualnego dzieci, procedury zgłaszania i działania podejmowane po zgłoszeniu.",
      },
      { property: "og:title", content: "Standardy bezpieczeństwa dzieci — MOTO TRIP" },
      {
        property: "og:description",
        content:
          "Standardy bezpieczeństwa dzieci w aplikacji MOTO TRIP. Zerowa tolerancja dla wykorzystywania seksualnego dzieci, procedury zgłaszania i działania podejmowane po zgłoszeniu.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChildSafetyStandardsPage,
});

function ChildSafetyStandardsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-4xl text-foreground">Standardy bezpieczeństwa dzieci</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Ostatnia aktualizacja: <strong className="text-foreground">22 sierpnia 2026 r.</strong>
      </p>

      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">1. Nasze stanowisko</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          MOTO TRIP ma zerową tolerancję dla wykorzystywania seksualnego dzieci oraz wszelkich treści
          lub zachowań zagrażających bezpieczeństwu dzieci i młodzieży.
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">2. Zakazane treści i zachowania</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          W MOTO TRIP zabronione jest tworzenie, publikowanie, przesyłanie, przechowywanie lub
          rozpowszechnianie treści przedstawiających wykorzystywanie seksualne dzieci, a także
          wszelkich treści, zachowań lub prób kontaktu, które mogą prowadzić do krzywdzenia,
          seksualizacji, manipulowania lub wykorzystywania osób małoletnich.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">Zakazane są w szczególności:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>materiały przedstawiające seksualne wykorzystywanie dzieci,</li>
          <li>nakłanianie osoby małoletniej do przesyłania prywatnych lub seksualnych materiałów,</li>
          <li>grooming, szantaż, groźby i próby wykorzystania dziecka,</li>
          <li>publikowanie danych umożliwiających skrzywdzenie lub nękanie osoby małoletniej,</li>
          <li>każda inna aktywność naruszająca bezpieczeństwo dzieci.</li>
        </ul>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">3. Zgłaszanie</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Użytkownicy mogą zgłaszać użytkowników, wiadomości i treści naruszające zasady bezpośrednio
          w aplikacji MOTO TRIP. Zgłoszenia są analizowane przez administratora.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          W pilnych sprawach dotyczących bezpieczeństwa dzieci można skontaktować się z nami także
          przez e-mail:{" "}
          <a href="mailto:info@apptrip.motorcycles" className="font-semibold text-primary">
            info@apptrip.motorcycles
          </a>
          .
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">4. Działania po zgłoszeniu</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Po uzyskaniu informacji o treści lub zachowaniu, które może naruszać bezpieczeństwo dziecka,
          MOTO TRIP podejmuje odpowiednie działania, w tym może usunąć treść, ograniczyć dostęp do
          konta, zablokować użytkownika oraz zabezpieczyć informacje potrzebne do dalszego postępowania.
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">5. Współpraca i zgodność z prawem</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          MOTO TRIP działa zgodnie z obowiązującymi przepisami dotyczącymi ochrony dzieci. W przypadku
          potwierdzonych naruszeń podejmujemy działania wymagane przez właściwe przepisy i współpracujemy
          z uprawnionymi organami, gdy jest to konieczne.
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">6. Punkt kontaktowy ds. bezpieczeństwa dzieci</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Osoba odpowiedzialna za kontakt w sprawach standardów bezpieczeństwa dzieci:
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          <strong className="text-foreground">Zespół MOTO TRIP</strong>
          <br />
          E-mail:{" "}
          <a href="mailto:info@apptrip.motorcycles" className="font-semibold text-primary">
            info@apptrip.motorcycles
          </a>
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">7. Kontakt</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          W sprawach dotyczących bezpieczeństwa dzieci, zgłoszeń lub niniejszych zasad:
          <a href="mailto:info@apptrip.motorcycles" className="ml-1 font-semibold text-primary">
            info@apptrip.motorcycles
          </a>
          .
        </p>
      </section>
    </main>
  );
}
