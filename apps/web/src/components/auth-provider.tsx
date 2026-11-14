"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiError, apiFetch } from "@/lib/api/api-fetch";
import { createClient } from "@/lib/supabase/client";
import {
  canVisit,
  landingPage,
  publicAccountRoutes,
  type CurrentUser,
} from "@/lib/auth/types";

const UserContext = createContext<CurrentUser | null>(null);
export const useCurrentUser = () => useContext(UserContext);

export async function logout() {
  const { error } = await createClient().auth.signOut();
  if (error) throw new Error("Could not sign out. Please try again.");
  window.location.replace("/login");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (publicAccountRoutes.includes(pathname)) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await apiFetch("/me");
        if (
          response.status === 403 &&
          (
            await response
              .clone()
              .json()
              .catch(() => null)
          )?.code === "ACCOUNT_SETUP_REQUIRED"
        ) {
          window.location.replace("/auth/start");
          return;
        }
        if (!response.ok) throw new Error(await apiError(response));
        const me = (await response.json()) as CurrentUser;
        if (me.onboardingRequired) {
          window.location.replace("/auth/invite");
          return;
        }
        if (!canVisit(me.role, pathname)) {
          window.location.replace(landingPage(me.role));
          return;
        }
        if (!cancelled) {
          setUser(me);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Unable to load your account.",
          );
      }
    };
    void load();
    let unsubscribe = () => {};
    try {
      const { data } = createClient().auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          setUser(null);
          window.location.replace("/login");
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      /* Configuration errors are shown by load(). */
    }
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [pathname, attempt]);
  if (publicAccountRoutes.includes(pathname)) return children;
  if (error)
    return (
      <main className="mx-auto max-w-lg p-10">
        <h1 className="text-xl font-bold">Account unavailable</h1>
        <p role="alert" className="my-4">
          {error}
        </p>
        <button
          onClick={() => { setUser(null); setError(null); setAttempt((value) => value + 1); }}
          className="mr-3 rounded border border-slate-300 px-4 py-2"
        >
          Retry account check
        </button>
        <button
          onClick={() => void logout().catch((err) => setError(err.message))}
          className="rounded bg-slate-900 px-4 py-2 text-white"
        >
          Sign out
        </button>
      </main>
    );
  if (!user || !canVisit(user.role, pathname))
    return <p role="status" className="p-10 text-slate-600">Loading your account…</p>;
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
