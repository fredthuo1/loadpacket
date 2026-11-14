import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type VerifiedAccount = { id: string; email: string };
export abstract class AccountIdentityProvider {
  abstract verifiedAccount(token: string): Promise<VerifiedAccount>;
}
/** Uses the existing provider's user endpoint, never browser metadata/email claims. */
@Injectable()
export class SupabaseAccountIdentityProvider extends AccountIdentityProvider {
  private client?: SupabaseClient;
  async verifiedAccount(token: string): Promise<VerifiedAccount> {
    const url = process.env.SUPABASE_URL,
      key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key)
      throw new ServiceUnavailableException(
        'Account verification is not configured.',
      );
    this.client ??= createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error } = await this.client.auth.getUser(token).catch(() => {
      throw new ServiceUnavailableException(
        'Account verification is temporarily unavailable. Please retry.',
      );
    });
    if (
      error ||
      !data.user ||
      data.user.is_anonymous ||
      !data.user.email ||
      !data.user.email_confirmed_at
    )
      throw new UnauthorizedException(
        'Confirm your email with the authentication provider, then sign in again.',
      );
    return { id: data.user.id, email: data.user.email.trim().toLowerCase() };
  }
}
