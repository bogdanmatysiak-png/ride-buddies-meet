import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading };
}

export type Profile = {
  id: string;
  nick: string;
  bike: string | null;
  city: string | null;
  intercom: boolean;
  intercom_type: string;
  pref_curvy: boolean;
  pref_avoid_highways: boolean;
  pref_avoid_tolls: boolean;
  pref_avoid_ferries: boolean;
};

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, nick, bike, city, intercom, intercom_type, pref_curvy, pref_avoid_highways, pref_avoid_tolls, pref_avoid_ferries",
        )
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useIsAdmin(userId: string | undefined) {
  const { data } = useQuery({
    queryKey: ["is-admin", userId],
    enabled: !!userId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId!,
        _role: "admin",
      });
      if (error) return false;
      return !!data;
    },
  });
  return !!data;
}