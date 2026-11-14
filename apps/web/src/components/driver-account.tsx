"use client";
import { useRef, useState } from 'react';
import { useCurrentUser } from './auth-provider';
import { managementRequest, type DriverProfile } from '@/lib/api/management';
import { Panel, buttonClass, secondaryClass } from './management-ui';
export function accountLabel(status: string | undefined, connected: boolean) {
  return status === 'INVITE_PENDING' ? 'Invitation Sent' : status === 'INVITE_CANCELLED' ? 'Invitation Cancelled' : connected ? 'Connected' : 'Not connected';
}
export function DriverAccount({ driver, onChange }: { driver: DriverProfile; onChange: (driver: DriverProfile) => void }) {
  const user = useCurrentUser();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const pending = driver.accountStatus === 'INVITE_PENDING';
  const allowed = user?.role === 'OWNER' && !driver.accountConnected && driver.accountStatus !== 'INVITE_CANCELLED';
  async function send() {
    if (busy) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      await managementRequest(`/drivers/${driver.id}/invite${pending ? '/resend' : ''}`, 'POST', {});
      dialog.current?.close();
      onChange(await managementRequest<DriverProfile>(`/drivers/${driver.id}`));
      setSuccess(pending ? 'Invitation resent.' : 'Invitation sent.');
    } catch (err) { dialog.current?.close(); setError(err instanceof Error ? err.message : 'Unable to send invitation.'); }
    finally { setBusy(false); }
  }
  return <div className="mb-6"><Panel title="Account">
    <p>{accountLabel(driver.accountStatus, driver.accountConnected)}</p>
    {driver.invitationLastSentAt && <p className="mt-2 text-sm text-slate-600">Sent: {new Date(driver.invitationLastSentAt).toLocaleString()}</p>}
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}{success && <p role="status" className="mt-3 text-green-700">{success}</p>}
    {allowed && <><button className={`${buttonClass} mt-4`} disabled={busy || driver.status !== 'ACTIVE' || !driver.email} onClick={() => pending ? void send() : dialog.current?.showModal()}>{busy ? 'Sending…' : pending ? 'Resend Invitation' : 'Send Invitation'}</button>
      {(!driver.email || driver.status !== 'ACTIVE') && <p className="mt-2 text-sm text-slate-600">An active driver with an email address is required.</p>}</>}
    <dialog ref={dialog} className="m-auto max-w-md rounded-2xl p-8 backdrop:bg-slate-950/50" aria-labelledby="invite-title" onCancel={event => { if (busy) event.preventDefault(); }}>
      <h2 id="invite-title" className="text-xl font-semibold">Invite {driver.firstName} {driver.lastName}?</h2>
      <p className="my-4">An invitation will be sent to: <strong>{driver.email}</strong></p><p>The driver will be able to create a password and access assigned loads.</p>
      <div className="mt-6 flex justify-end gap-3"><button className={secondaryClass} disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button><button className={buttonClass} disabled={busy} onClick={() => void send()}>{busy ? 'Sending…' : 'Send Invitation'}</button></div>
    </dialog>
  </Panel></div>;
}
