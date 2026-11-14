import {
  ConflictException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import {
  DriverIdentityProvider,
  type CreatedIdentity,
  type InviteIdentityInput,
} from './driver-identity-provider';

const conflict = () =>
  new ConflictException(
    'An authentication account already exists for this email. It cannot be automatically linked. Contact your administrator.',
  );

@Injectable()
export class SupabaseAdminService extends DriverIdentityProvider {
  private client?: SupabaseClient;
  private config() {
    const secret = process.env.SUPABASE_SECRET_KEY;
    const url = process.env.SUPABASE_URL;
    const app = process.env.WEB_APP_URL;
    if (!secret?.startsWith('sb_secret_') || !url || !app)
      throw new ServiceUnavailableException(
        'Driver invitations are not configured. Contact your administrator.',
      );
    let base: URL;
    try {
      base = new URL(app);
    } catch {
      throw new ServiceUnavailableException(
        'Invitation web address is not configured.',
      );
    }
    if (
      (base.protocol !== 'https:' &&
        !(
          base.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(base.hostname)
        )) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      base.pathname !== '/'
    )
      throw new ServiceUnavailableException(
        'Invitation web address is not configured.',
      );
    this.client ??= createClient(url, secret, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
      },
    });
    return { client: this.client, redirectTo: `${base.origin}/auth/invite` };
  }
  private failure(error: { status?: number; code?: string } | null): never {
    if (error?.code === 'email_exists' || error?.code === 'user_already_exists')
      throw conflict();
    if (error?.status === 429)
      throw new HttpException(
        'Email rate limit reached. Wait before trying again.',
        429,
      );
    throw new ServiceUnavailableException(
      'Invitation email could not be sent. Check email configuration and try again.',
    );
  }
  async invite(input: InviteIdentityInput): Promise<CreatedIdentity> {
    const { client, redirectTo } = this.config();
    try {
      // Supabase also invites existing unconfirmed accounts. Reject them before
      // sending; the per-operation nonce below closes the remaining creation race.
      for (let page = 1; page <= 100; page++) {
        const { data, error } = await client.auth.admin.listUsers({
          page,
          perPage: 1000,
        });
        if (error) this.failure(error);
        if (
          data.users.some(
            (user) => user.email?.toLowerCase() === input.email.toLowerCase(),
          )
        )
          throw conflict();
        if (data.users.length < 1000) break;
        if (page === 100)
          throw new ServiceUnavailableException(
            'Account conflict check exceeded its limit. Contact your administrator.',
          );
      }
      const operationId = randomUUID();
      const { data, error } = await client.auth.admin.inviteUserByEmail(
        input.email,
        {
          redirectTo,
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            companyName: input.companyName,
            invitationOperation: operationId,
          },
        },
      );
      if (error) this.failure(error);
      const user = data.user;
      // GoTrue applies invitation data only during creation, never to a reused
      // unconfirmed user. Metadata is provenance here, never authorization.
      if (
        !user ||
        user.user_metadata.invitationOperation !== operationId ||
        user.email?.toLowerCase() !== input.email.toLowerCase()
      )
        throw conflict();
      return { id: user.id, email: input.email, operationId };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.failure(null);
    }
  }
  async resend(id: string, email: string): Promise<void> {
    const { client, redirectTo } = this.config();
    try {
      const found = await client.auth.admin.getUserById(id);
      if (found.error) this.failure(found.error);
      if (found.data.user?.email?.toLowerCase() !== email.toLowerCase())
        throw conflict();
      if (found.data.user.email_confirmed_at) {
        // The invitation may have been verified without completing onboarding.
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo,
        });
        if (error) this.failure(error);
      } else {
        const { data, error } = await client.auth.admin.inviteUserByEmail(
          email,
          { redirectTo },
        );
        if (error) this.failure(error);
        if (data.user?.id !== id) throw conflict();
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.failure(null);
    }
  }
  async compensate(identity: CreatedIdentity): Promise<boolean> {
    try {
      const { client } = this.config();
      const { data, error } = await client.auth.admin.getUserById(identity.id);
      const user = data.user;
      if (
        error ||
        !user ||
        user.id !== identity.id ||
        user.email?.toLowerCase() !== identity.email.toLowerCase() ||
        user.user_metadata.invitationOperation !== identity.operationId ||
        user.email_confirmed_at ||
        user.last_sign_in_at
      )
        return false;
      return !(await client.auth.admin.deleteUser(identity.id)).error;
    } catch {
      return false;
    }
  }
}
