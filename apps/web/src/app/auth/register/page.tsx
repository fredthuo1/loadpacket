"use client";
import { AccountShell, ProviderCredentials } from "@/components/account-access";
export default function RegisterPage() {
  return (
    <AccountShell title="Start your carrier account">
      <p className="mb-5 text-slate-600">
        Create your sign-in identity, confirm your email, then set up your
        carrier organization.
      </p>
      <ProviderCredentials
        register
        onAuthenticated={() => window.location.replace("/auth/start")}
      />
    </AccountShell>
  );
}
