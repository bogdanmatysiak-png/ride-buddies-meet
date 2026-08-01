import { useEffect, useState } from "react";

export type RideLevel = "chill" | "sport" | "adventure";

export type Ride = {
  id: string;
  title: string;
  start: string;
  end: string;
  date: string; // ISO date
  time: string;
  km: number;
  level: RideLevel;
  spots: number;
  host: string;
  description: string;
  riders: string[];
  joined: boolean;
};

export const levelLabel: Record<RideLevel, string> = {
  chill: "Spokojna",
  sport: "Sportowa",
  adventure: "Adventure",
};

const seed: Ride[] = [
  {
    id: "beskidy-serpentyny",
    title: "Beskidzkie serpentyny",
    start: "Kraków",
    end: "Przełęcz Salmopolska",
    date: "2026-08-08",
    time: "07:30",
    km: 240,
    level: "sport",
    spots: 12,
    host: "Marek „Kruk”",
    description:
      "Wczesny start, tankowanie w Wadowicach, potem same zakręty. Tempo żywe, ale nikogo nie gubimy — zbiórka po każdym odcinku.",
    riders: ["Marek", "Ola", "Bartek", "Kamil", "Zosia"],
    joined: false,
  },
  {
    id: "mazury-wieczorem",
    title: "Mazury na miękko",
    start: "Olsztyn",
    end: "Mikołajki",
    date: "2026-08-15",
    time: "10:00",
    km: 160,
    level: "chill",
    spots: 20,
    host: "Ania",
    description:
      "Luźna trasa dla każdego, dużo postojów na kawę i zdjęcia nad wodą. Idealne na pierwszą wspólną wyprawę.",
    riders: ["Ania", "Piotr", "Ewa"],
    joined: true,
  },
  {
    id: "bieszczady-szuter",
    title: "Bieszczady: szuter i mgła",
    start: "Sanok",
    end: "Wetlina",
    date: "2026-08-22",
    time: "06:45",
    km: 310,
    level: "adventure",
    spots: 8,
    host: "Tomek",
    description:
      "Mieszanka asfaltu i szutrów, opony dual-sport obowiązkowe. Nocleg w bazie, powrót w niedzielę.",
    riders: ["Tomek", "Rafał", "Iga", "Wojtek"],
    joined: false,
  },
  {
    id: "wybrzeze-o-swicie",
    title: "Wybrzeże o świcie",
    start: "Gdańsk",
    end: "Łeba",
    date: "2026-09-05",
    time: "05:30",
    km: 200,
    level: "chill",
    spots: 15,
    host: "Kasia",
    description:
      "Wyjazd przed wschodem słońca, śniadanie na plaży, powrót lasami. Kaski otwarte, tempo turystyczne.",
    riders: ["Kasia", "Michał"],
    joined: false,
  },
];

const KEY = "moto-wyprawy-v1";
let rides: Ride[] = seed;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) rides = JSON.parse(raw) as Ride[];
  } catch {
    /* ignore */
  }
}

function commit(next: Ride[]) {
  rides = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(rides));
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l());
}

export function useRides() {
  const [, force] = useState(0);
  useEffect(() => {
    hydrate();
    const l = () => force((n) => n + 1);
    listeners.add(l);
    l();
    return () => listeners.delete(l);
  }, []);
  return rides;
}

export function toggleJoin(id: string) {
  commit(
    rides.map((r) =>
      r.id === id
        ? {
            ...r,
            joined: !r.joined,
            riders: r.joined
              ? r.riders.filter((n) => n !== "Ty")
              : [...r.riders, "Ty"],
          }
        : r,
    ),
  );
}

export function addRide(input: Omit<Ride, "id" | "riders" | "joined">) {
  const id = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  commit([...rides, { ...input, id, riders: [input.host], joined: true }]);
  return id;
}

export function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}