"use client";
import { useEffect, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { apiError, apiFetch } from '@/lib/api/api-fetch';
import type { CurrentUser } from '@/lib/auth/types';
import { PasswordField } from '@/components/password-field';
import { logout } from '@/components/auth-provider';
const invalid = 'This invitation is no longer valid. Ask your company administrator to resend the invitation.';
export default function InvitePage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        if (new URLSearchParams(window.location.search).has('error')) throw new Error(invalid);
        const supabase = createClient();
        await supabase.auth.initialize();
        const { data } = await supabase.auth.getSession();
        if (!data.session) throw new Error(invalid);
        const response = await apiFetch('/me');
        if (!response.ok) throw new Error(invalid);
        const me = await response.json() as CurrentUser;
        if (me.role !== 'DRIVER' || !me.driver) throw new Error('This session is not linked to a driver invitation. Sign out and open the invitation email.');
        if (alive) setUser(me);
      } catch (err) { if (alive) setError(err instanceof Error ? err.message : invalid); }
    }
    void load();
    return () => { alive = false; };
  }, []);
  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !user) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password'));
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== form.get('confirmation')) { setError('Passwords must match.'); return; }
    setBusy(true); setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      // A previous attempt may have saved the password before completion failed.
      // The password sign-in below still proves possession before activation.
      if (updateError && updateError.code !== 'same_password') throw new Error(updateError.code === 'weak_password' ? updateError.message : 'Password could not be saved. Request a fresh invitation and try again.');
      // Establish provider-signed password AMR before asking Nest to activate.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (signInError) throw new Error('Password was saved, but sign-in failed. Sign in with your new password to finish activation.');
      const response = await apiFetch('/me/complete-invitation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error(await apiError(response));
      window.location.replace('/driver');
    } catch (err) { setError(err instanceof Error ? err.message : 'Activation failed. Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8">
    <p className="text-2xl font-black">LoadPacket</p><h1 className="mt-8 text-xl font-semibold">Welcome to LoadPacket</h1>
    {error && <p role="alert" className="my-4 text-red-700">{error}</p>}
    {!user && !error && <p role="status">Checking your invitation…</p>}
    {user?.onboardingRequired && <><p className="my-4 text-slate-600">Your company has invited you as a Driver.</p><p className="mb-4 text-sm">{user.email}</p><form onSubmit={activate} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
      <PasswordField label="Create Password" autoComplete="new-password" minLength={8} />
      <PasswordField label="Confirm Password" name="confirmation" autoComplete="new-password" minLength={8} />
      <button className="w-full rounded bg-slate-950 p-3 text-white" disabled={busy}>{busy ? 'Activating…' : 'Activate Account'}</button>
    </fieldset></form></>}
    {user && !user.onboardingRequired && <a className="mt-6 block text-blue-700" href="/driver">Account connected. Continue to your loads</a>}
    <a className="mt-6 block text-sm text-blue-700" href="/login">Return to sign in</a>
    {error && <button className="mt-4 min-h-11 text-blue-700 underline" onClick={() => void logout().catch(() => setError('Could not sign out. Please retry.'))}>Sign out and use another account</button>}
  </section></main>;
}
