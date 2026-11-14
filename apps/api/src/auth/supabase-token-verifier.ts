import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { JWTVerifyGetKey, JWTPayload } from 'jose';
import { TokenVerifier } from './token-verifier';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class SupabaseTokenVerifier extends TokenVerifier {
  private jwks?: JWTVerifyGetKey;
  private legacyClient?: SupabaseClient;

  async verify(
    token: string,
  ): Promise<{ sub: string; passwordAuthenticatedAt?: number }> {
    const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
    if (!baseUrl)
      throw new ServiceUnavailableException(
        'Authentication is not configured.',
      );
    const issuer = `${baseUrl}/auth/v1`;
    const { createRemoteJWKSet, decodeProtectedHeader, decodeJwt, jwtVerify } =
      await import('jose');
    try {
      // Header inspection selects a verifier; it never establishes identity.
      const { alg } = decodeProtectedHeader(token);
      let claims: JWTPayload;
      if (alg === 'HS256') {
        const key = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!key)
          throw new UnauthorizedException(
            'Legacy token verification is not configured.',
          );
        this.legacyClient ??= createClient(baseUrl, key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
        const { data, error } = await this.legacyClient.auth.getUser(token);
        if (error || !data.user) throw new UnauthorizedException();
        // Claims are read only AFTER Supabase Auth has verified the token.
        claims = decodeJwt(token);
        if (claims.sub !== data.user.id) throw new UnauthorizedException();
      } else {
        this.jwks ??= createRemoteJWKSet(
          new URL(`${issuer}/.well-known/jwks.json`),
          {
            cacheMaxAge: 600_000,
            timeoutDuration: 5_000,
          },
        );
        ({ payload: claims } = await jwtVerify(token, this.jwks, {
          issuer,
          audience: 'authenticated',
          algorithms: ['ES256', 'RS256'],
          requiredClaims: ['sub', 'exp', 'iss', 'aud'],
        }));
      }
      const now = Math.floor(Date.now() / 1000);
      if (
        claims.iss !== issuer ||
        !(Array.isArray(claims.aud)
          ? claims.aud.includes('authenticated')
          : claims.aud === 'authenticated') ||
        typeof claims.exp !== 'number' ||
        claims.exp <= now ||
        (typeof claims.nbf === 'number' && claims.nbf > now) ||
        typeof claims.sub !== 'string' ||
        !UUID.test(claims.sub) ||
        claims.role !== 'authenticated' ||
        claims.is_anonymous === true
      ) {
        throw new UnauthorizedException();
      }
      const passwordTimes = Array.isArray(claims.amr)
        ? (claims.amr as unknown[]).flatMap((entry) => {
            if (
              !entry ||
              typeof entry !== 'object' ||
              !('method' in entry) ||
              entry.method !== 'password' ||
              !('timestamp' in entry) ||
              typeof entry.timestamp !== 'number' ||
              !Number.isInteger(entry.timestamp) ||
              entry.timestamp <= 0 ||
              entry.timestamp > now
            )
              return [];
            return [entry.timestamp];
          })
        : [];
      return {
        sub: claims.sub,
        ...(passwordTimes.length
          ? { passwordAuthenticatedAt: Math.max(...passwordTimes) }
          : {}),
      };
    } catch {
      // Never include token material, provider responses, or signing details.
      throw new UnauthorizedException('Invalid or expired access token.');
    }
  }
}
