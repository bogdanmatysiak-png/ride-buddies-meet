import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useSession } from "@/hooks/useAuth";

type AuthSearch = { redirect?: string | undefined };

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    redirect: typeof search["redirect"] === "string" ? (search["redirect"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Zaloguj się — Motor Trip" },
      {
        name: "description",
        content:
          "Zaloguj się lub utwórz konto, aby zapisywać się na wyprawy motocyklowe i ogłaszać własne trasy.",
      },
      { property: "og:title", content: "Zaloguj się — Motor Trip" },
      {
        property: "og:description",
        content: "Konto pozwala zapisywać się na wyprawy i ogłaszać własne trasy.",
      },
    ],
  }),
  component: AuthPage,
});

function safePath(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nick, setNick] = useState("");
  const [bike, setBike] = useState("");
  const [intercom, setIntercom] = useState(false);
  const [intercomType, setIntercomType] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const target = safePath(search.redirect);
  const { session, loading } = useSession();

  useEffect(() => {
    if (!loading && session) navigate({ to: target, replace: true });
  }, [loading, session, navigate, target]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + target,
            data: { nick },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setSent(true);
          return;
        }
        await supabase
          .from("profiles")
          .upsert(
            {
              id: data.session.user.id,
              nick,
              bike: bike || null,
              intercom,
              intercom_type: intercom ? intercomType.trim() : "",
            },
            { onConflict: "id" },
          );
        toast.success("Konto utworzone. Witaj w ekipie!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Zalogowano");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Coś nie zadziałało");
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Nie udało się zalogować przez Google");
    }
  }

  if (sent) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-3xl text-foreground">Sprawdź skrzynkę</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Wysłaliśmy link potwierdzający na {email}. Kliknij go, żeby dokończyć rejestrację.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm font-semibold text-primary">
          Wróć do wypraw
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-4xl text-foreground">
        {mode === "login" ? "Wsiadaj z nami" : "Załóż konto"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Konto pozwala zapisywać się na wyprawy i ogłaszać własne trasy.
      </p>

      <button
        onClick={googleSignIn}
        className="mt-6 w-full rounded-md border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/60"
      >
        Kontynuuj z Google
      </button>

      <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> albo e-mailem
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <Labeled label="Nick">
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              required
              placeholder="Kruk"
              className="input-moto"
            />
          </Labeled>
        )}
        {mode === "signup" && (
          <>
            <Labeled label="Rodzaj motocykla">
              <input
                value={bike}
                onChange={(e) => setBike(e.target.value)}
                placeholder="Yamaha Ténéré 700"
                className="input-moto"
              />
            </Labeled>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Interkom
              </span>
              <div className="mt-2 flex gap-2">
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => setIntercom(v)}
                    className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                      intercom === v
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {v ? "Tak" : "Nie"}
                  </button>
                ))}
              </div>
              {intercom && (
                <input
                  value={intercomType}
                  onChange={(e) => setIntercomType(e.target.value)}
                  placeholder="Cardo Packtalk Edge / Sena 50S"
                  className="input-moto mt-3"
                />
              )}
            </div>
          </>
        )}
        <Labeled label="E-mail">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input-moto"
          />
        </Labeled>
        <Labeled label="Hasło">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="input-moto"
          />
        </Labeled>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-ember transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {mode === "login" ? "Zaloguj się" : "Utwórz konto"}
        </button>
      </form>

      <button
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
        className="mt-5 w-full text-sm text-muted-foreground hover:text-primary"
      >
        {mode === "login" ? "Nie masz konta? Zarejestruj się" : "Masz już konto? Zaloguj się"}
      </button>
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