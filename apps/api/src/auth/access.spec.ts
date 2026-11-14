import { invitationHash, invitationState, names } from './access.service';
import { SupabaseAccountIdentityProvider } from './account-identity-provider';
import { createClient } from '@supabase/supabase-js';
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
describe('carrier account/invitation boundary', () => {
  it('hashes opaque tokens without embedding role/tenant claims', () => {
    const raw = 'a'.repeat(64);
    expect(invitationHash(raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(invitationHash(raw)).not.toBe(raw);
    expect(invitationHash(raw)).toBe(invitationHash(raw));
  });
  it('trims names and rejects whitespace-only setup', () => {
    expect(names(' Alice ', ' Smith ')).toEqual({
      firstName: 'Alice',
      lastName: 'Smith',
    });
    expect(() => names(' ', 'Smith')).toThrow();
  });
  it('expires precisely at expiry while preserving terminal state', () => {
    expect(
      invitationState({ status: 'PENDING', expiresAt: new Date(100) }, 99),
    ).toBe('PENDING');
    expect(
      invitationState({ status: 'PENDING', expiresAt: new Date(100) }, 100),
    ).toBe('EXPIRED');
    expect(
      invitationState({ status: 'REVOKED', expiresAt: new Date(100) }, 99),
    ).toBe('REVOKED');
    expect(
      invitationState({ status: 'ACCEPTED', expiresAt: new Date(100) }, 101),
    ).toBe('ACCEPTED');
  });
  describe('provider user verification', () => {
    const savedUrl = process.env.SUPABASE_URL,
      savedKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    beforeEach(() => {
      process.env.SUPABASE_URL = 'http://127.0.0.1:3104';
      process.env.SUPABASE_PUBLISHABLE_KEY = 'fictional-public-key';
    });
    afterEach(() => {
      if (savedUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = savedUrl;
      if (savedKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
      else process.env.SUPABASE_PUBLISHABLE_KEY = savedKey;
    });
    function provider(user: unknown, error: unknown = null) {
      const getUser = jest.fn().mockResolvedValue({ data: { user }, error });
      jest
        .mocked(createClient)
        .mockReturnValue({ auth: { getUser } } as unknown as ReturnType<
          typeof createClient
        >);
      return { adapter: new SupabaseAccountIdentityProvider(), getUser };
    }
    it('uses provider-confirmed canonical email, not browser metadata', async () => {
      const p = provider({
        id: 'identity',
        email: ' Office@Example.invalid ',
        email_confirmed_at: '2026-01-01',
        user_metadata: { role: 'OWNER' },
      });
      await expect(
        p.adapter.verifiedAccount('fictional-token'),
      ).resolves.toEqual({ id: 'identity', email: 'office@example.invalid' });
      expect(p.getUser).toHaveBeenCalledWith('fictional-token');
    });
    it('rejects unconfirmed email even if metadata claims verification', async () => {
      await expect(
        provider({
          id: 'identity',
          email: 'a@example.invalid',
          user_metadata: { email_verified: true },
        }).adapter.verifiedAccount('fictional-token'),
      ).rejects.toThrow('Confirm');
    });
    it('rejects anonymous identities and provider failures', async () => {
      await expect(
        provider({
          id: 'identity',
          email: 'a@example.invalid',
          email_confirmed_at: '2026-01-01',
          is_anonymous: true,
        }).adapter.verifiedAccount('fictional-token'),
      ).rejects.toThrow();
      await expect(
        provider(null, {
          message: 'private provider payload',
        }).adapter.verifiedAccount('fictional-token'),
      ).rejects.toThrow('Confirm');
    });
    it('sanitizes thrown provider failures without echoing private payloads', async () => {
      const p = provider(null);
      p.getUser.mockRejectedValue(new Error('private-provider-payload'));
      await expect(
        p.adapter.verifiedAccount('fictional-token'),
      ).rejects.toThrow(
        'Account verification is temporarily unavailable. Please retry.',
      );
    });
  });
});
