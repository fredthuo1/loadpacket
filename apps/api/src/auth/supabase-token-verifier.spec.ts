import { SupabaseTokenVerifier } from './supabase-token-verifier';
import { UnauthorizedException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

describe('Supabase token cryptographic verification', () => {
  const subject = '00000000-0000-4000-8000-000000000001';
  const issuer = 'https://auth-test.supabase.co/auth/v1';
  let jose: typeof import('jose');
  let keys: Awaited<ReturnType<(typeof import('jose'))['generateKeyPair']>>;
  let fetchMock: jest.SpyInstance;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  beforeAll(async () => {
    jose = await import('jose');
    keys = await jose.generateKeyPair('ES256');
  });
  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://auth-test.supabase.co';
    const publicKey = await jose.exportJWK(keys.publicKey);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          keys: [{ ...publicKey, kid: 'test-key', alg: 'ES256', use: 'sig' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  });
  afterEach(() => {
    fetchMock.mockRestore();
  });
  afterAll(() => {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  });
  function token(overrides: Record<string, unknown> = {}) {
    return new jose.SignJWT({
      role: 'authenticated',
      sub: subject,
      iss: issuer,
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 300,
      ...overrides,
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .sign(keys.privateKey);
  }
  it('verifies a valid signature and caches the JWKS', async () => {
    const verifier = new SupabaseTokenVerifier();
    const jwt = await token();
    await expect(verifier.verify(jwt)).resolves.toEqual({ sub: subject });
    await expect(verifier.verify(jwt)).resolves.toEqual({ sub: subject });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('extracts password proof only from provider-signed AMR', async () => {
    const at = Math.floor(Date.now() / 1000);
    const jwt = await token({
      amr: [
        { method: 'otp', timestamp: at },
        { method: 'password', timestamp: at - 10 },
        { method: 'password', timestamp: at },
      ],
    });
    await expect(new SupabaseTokenVerifier().verify(jwt)).resolves.toEqual({
      sub: subject,
      passwordAuthenticatedAt: at,
    });
  });
  it.each([
    null,
    'password',
    [{ method: 'otp', timestamp: 1 }],
    [{ method: 'password', timestamp: '123' }],
    [{ method: 'password', timestamp: 9999999999 }],
    [null],
    [{ method: 'password', timestamp: -1 }],
  ])(
    'does not infer password proof from malformed/non-password AMR %j',
    async (amr) => {
      await expect(
        new SupabaseTokenVerifier().verify(await token({ amr })),
      ).resolves.toEqual({ sub: subject });
    },
  );
  it.each([
    ['expired', { exp: 1 }],
    ['wrong issuer', { iss: 'https://foreign.supabase.co/auth/v1' }],
    ['wrong audience', { aud: 'anon' }],
    ['missing expiry', { exp: undefined }],
    ['invalid subject', { sub: 'not-a-uuid' }],
    ['service role', { role: 'service_role' }],
    ['anonymous user', { is_anonymous: true }],
    ['future token', { nbf: Math.floor(Date.now() / 1000) + 3600 }],
  ] as const)('rejects %s', async (_name, overrides) => {
    await expect(
      new SupabaseTokenVerifier().verify(await token(overrides)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects a signature made by another key', async () => {
    const foreign = await jose.generateKeyPair('ES256');
    const jwt = await new jose.SignJWT({ sub: subject, role: 'authenticated' })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .sign(foreign.privateKey);
    await expect(
      new SupabaseTokenVerifier().verify(jwt),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects unsigned alg:none tokens', async () => {
    const jwt = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: subject, iss: issuer, aud: 'authenticated', exp: 9999999999 })).toString('base64url')}.`;
    await expect(
      new SupabaseTokenVerifier().verify(jwt),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires server-side verification for legacy HS256 tokens', async () => {
    process.env.SUPABASE_PUBLISHABLE_KEY = 'local-unit-test-key';
    const getUser = jest
      .fn()
      .mockResolvedValue({ data: { user: { id: subject } }, error: null });
    jest
      .mocked(createClient)
      .mockReturnValue({ auth: { getUser } } as unknown as ReturnType<
        typeof createClient
      >);
    const jwt = await new jose.SignJWT({ sub: subject, role: 'authenticated' })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('local-unit-test-signing-key-only'));
    const verifier = new SupabaseTokenVerifier();
    await expect(verifier.verify(jwt)).resolves.toEqual({ sub: subject });
    expect(getUser).toHaveBeenCalledWith(jwt);
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid signature' },
    });
    await expect(verifier.verify(jwt)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
