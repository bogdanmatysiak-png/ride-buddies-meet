import { supabase } from "@/integrations/supabase/client";

export type RoutePrefs = {
  curvy: boolean;
  avoidHighways: boolean;
  avoidTolls: boolean;
  avoidFerries: boolean;
};

export const defaultRoutePrefs: RoutePrefs = {
  curvy: true,
  avoidHighways: true,
  avoidTolls: true,
  avoidFerries: true,
};

export type ProfilePrefColumns = {
  pref_curvy: boolean;
  pref_avoid_highways: boolean;
  pref_avoid_tolls: boolean;
  pref_avoid_ferries: boolean;
};

export function prefsFromProfile(profile: ProfilePrefColumns | null | undefined): RoutePrefs {
  if (!profile) return defaultRoutePrefs;
  return {
    curvy: profile.pref_curvy,
    avoidHighways: profile.pref_avoid_highways,
    avoidTolls: profile.pref_avoid_tolls,
    avoidFerries: profile.pref_avoid_ferries,
  };
}

export function prefsToProfile(prefs: RoutePrefs): ProfilePrefColumns {
  return {
    pref_curvy: prefs.curvy,
    pref_avoid_highways: prefs.avoidHighways,
    pref_avoid_tolls: prefs.avoidTolls,
    pref_avoid_ferries: prefs.avoidFerries,
  };
}

export async function saveRoutePrefs(userId: string, prefs: RoutePrefs) {
  const { error } = await supabase.from("profiles").update(prefsToProfile(prefs)).eq("id", userId);
  if (error) throw error;
}

/** Parametr `avoid` dla osadzonej mapy Google. */
export function embedAvoidParam(prefs: RoutePrefs): string {
  const parts: string[] = [];
  if (prefs.avoidHighways) parts.push("highways");
  if (prefs.avoidTolls) parts.push("tolls");
  if (prefs.avoidFerries) parts.push("ferries");
  return parts.join("|");
}

export function prefsSummary(prefs: RoutePrefs): string {
  const parts: string[] = [];
  if (prefs.curvy) parts.push("więcej zakrętów");
  if (prefs.avoidHighways) parts.push("bez autostrad i ekspresówek");
  if (prefs.avoidTolls) parts.push("bez płatnych odcinków");
  if (prefs.avoidFerries) parts.push("bez promów");
  return parts.length ? parts.join(" · ") : "najszybsza trasa";
}