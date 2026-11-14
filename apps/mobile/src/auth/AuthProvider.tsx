import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import type { Session } from "@supabase/supabase-js";
import type { ApplicationUser } from "../../../../packages/api-contracts/driver";
import { api, supabase } from "./supabase";
import { observeSession } from "./session";

interface AuthState {
  session: Session | null;
  applicationUser: ApplicationUser | null;
  loading: boolean;
  error: string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  refreshSession(): Promise<void>;
  retry(): void;
}
const Context = createContext<AuthState | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<{
    subject: string;
    revision: number;
    user: ApplicationUser | null;
    error: string | null;
  } | null>(null);
  const [restoring, setRestoring] = useState(!!supabase);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const subject = session?.user.id;
  // Foreground checks must not unmount a camera/file picker or lose an in-flight upload.
  // A denied operational request explicitly clears account; background checks publish only their result.
  const resolved = !!subject && account?.subject === subject;
  const applicationUser = resolved ? account!.user : null;
  const error = resolved ? account!.error : restoreError;
  const loading = restoring || (!!subject && !resolved);
  useEffect(
    () =>
      api.onAccessDenied(() => {
        setAccount(null);
        setRevision((n) => n + 1);
      }),
    [],
  );
  useEffect(() => {
    if (!supabase) return;
    const unsubscribe = observeSession<Session>(
      {
        read: async () => {
          const { data, error: failure } = await supabase!.auth.getSession();
          if (failure) throw failure;
          return data.session;
        },
        subscribe: (receive) => {
          const {
            data: { subscription },
          } = supabase!.auth.onAuthStateChange((_event, next) => receive(next));
          return () => subscription.unsubscribe();
        },
      },
      (next) => {
        setSession(next);
        setRestoring(false);
        setRestoreError(null);
      },
      () => {
        setRestoring(false);
        setRestoreError(
          "Could not restore your session. Please sign in again.",
        );
      },
    );
    const updateRefresh = (state: string) => {
      if (state === "active") {
        supabase!.auth.startAutoRefresh();
        setRevision((n) => n + 1);
      } else supabase!.auth.stopAutoRefresh();
    };
    updateRefresh(AppState.currentState);
    const listener = AppState.addEventListener("change", updateRefresh);
    return () => {
      unsubscribe();
      listener.remove();
      supabase!.auth.stopAutoRefresh();
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (!subject) return;
    void api
      .request<ApplicationUser>("/me")
      .then((user) => {
        if (active) setAccount({ subject, revision, user, error: null });
      })
      .catch((failure: unknown) => {
        if (active)
          setAccount({
            subject,
            revision,
            user: null,
            error:
              failure instanceof Error
                ? failure.message
                : "Could not load your account.",
          });
      });
    return () => {
      active = false;
    };
  }, [subject, revision]);
  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase)
      throw new Error("Sign-in is not configured. Contact your carrier.");
    const { error: failure } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (failure)
      throw new Error(
        failure.status && failure.status < 500
          ? failure.message
          : "We couldn't reach LoadPacket. Check your connection and try again.",
      );
  }, []);
  const signOut = useCallback(async () => {
    await supabase?.auth.signOut({ scope: "local" });
    setSession(null);
    setAccount(null);
  }, []);
  const refreshSession = useCallback(async () => {
    const result = await supabase?.auth.refreshSession();
    if (result?.error) throw result.error;
  }, []);
  const value = useMemo(
    () => ({
      session,
      applicationUser,
      loading,
      error,
      signIn,
      signOut,
      refreshSession,
      retry: () => setRevision((n) => n + 1),
    }),
    [session, applicationUser, loading, error, signIn, signOut, refreshSession],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
