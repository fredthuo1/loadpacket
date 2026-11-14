import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient, processLock } from "@supabase/supabase-js";
import { createApiClient } from "../api/client";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const authConfigured = !!url && !!key;
export const supabase = authConfigured
  ? createClient(url!, key!, {
      auth: {
        storage: {
          getItem: (name) => SecureStore.getItemAsync(name),
          setItem: (name, value) => SecureStore.setItemAsync(name, value),
          removeItem: (name) => SecureStore.deleteItemAsync(name),
        },
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        lock: processLock,
      },
    })
  : null;
export const api = createApiClient(process.env.EXPO_PUBLIC_API_URL, {
  identity: async () =>
    (await supabase?.auth.getSession())?.data.session?.user.id ?? null,
  token: async () =>
    (await supabase?.auth.getSession())?.data.session?.access_token ?? null,
  refresh: async () =>
    (await supabase?.auth.refreshSession())?.data.session?.access_token ?? null,
  clear: async () => {
    await supabase?.auth.signOut({ scope: "local" });
  },
});
