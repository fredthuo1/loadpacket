import { Redirect } from "expo-router";
import { useAuth } from "../src/auth/AuthProvider";
import { Loading } from "../src/components/ui";
export default function Index() {
  const auth = useAuth();
  return auth.loading ? (
    <Loading />
  ) : (
    <Redirect href={auth.session ? "/(driver)" : "/login"} />
  );
}
