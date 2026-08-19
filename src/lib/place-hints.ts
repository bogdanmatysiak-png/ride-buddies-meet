/** Podpowiedzi dla niedokładnych nazw miejsc (bez miasta/kraju). */

const COUNTRY_WORDS = [
  "polska",
  "poland",
  "czechy",
  "słowacja",
  "niemcy",
  "litwa",
  "ukraina",
  "austria",
  "węgry",
];

/** Współrzędne „52.1,21.0” albo plus code są wystarczająco precyzyjne. */
function isCoordinates(value: string): boolean {
  return /^-?\d{1,3}[.,]\d+\s*,\s*-?\d{1,3}[.,]\d+$/.test(value.trim());
}

/** True, gdy w nazwie brakuje miasta/kraju (np. „Rynek” zamiast „Rynek, Kraków, Polska”). */
export function needsCityHint(value: string): boolean {
  const v = value.trim();
  if (v.length < 2 || isCoordinates(v)) return false;
  const parts = v
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 3) return false;
  const hasCountry = COUNTRY_WORDS.some((c) => v.toLowerCase().includes(c));
  if (parts.length === 2 && hasCountry) return false;
  return true;
}

/** Uzupełnia nazwę o kraj (domyślnie Polska), zachowując miasto, jeśli już jest. */
export function withCountry(value: string, country = "Polska"): string {
  const v = value.trim().replace(/,\s*$/, "");
  if (!v) return v;
  if (v.toLowerCase().includes(country.toLowerCase())) return v;
  return `${v}, ${country}`;
}

export const PLACE_HINT_TEXT =
  "Podawaj miejsca w formule „ulica/miejsce, miasto, kraj” — np. „Rynek Główny, Kraków, Polska”. Bez miasta i kraju Google często nie znajduje trasy.";
