import { createClient } from '@supabase/supabase-js';
import { SupabaseAdminService } from './supabase-admin.service';
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
describe('server-only Supabase invitation adapter (no network)', () => {
  const original = {
    secret: process.env.SUPABASE_SECRET_KEY,
    url: process.env.SUPABASE_URL,
    app: process.env.WEB_APP_URL,
  };
  const input = {
    email: 'driver@example.com',
    firstName: 'Test',
    lastName: 'Driver',
    companyName: 'Test Carrier',
  };
  const account = {
    id: '00000000-0000-4000-8000-000000000900',
    email: input.email,
    user_metadata: {} as Record<string, string>,
  };
  let admin: {
    listUsers: jest.Mock;
    inviteUserByEmail: jest.Mock;
    getUserById: jest.Mock;
    deleteUser: jest.Mock;
  };
  let recovery: jest.Mock;
  beforeEach(() => {
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_fixture';
    process.env.SUPABASE_URL = 'https://fixture.supabase.co';
    process.env.WEB_APP_URL = 'http://localhost:3000';
    admin = {
      listUsers: jest
        .fn()
        .mockResolvedValue({ data: { users: [] }, error: null }),
      inviteUserByEmail: jest
        .fn()
        .mockImplementation(
          (_email: string, options: { data: Record<string, string> }) =>
            Promise.resolve({
              data: { user: { ...account, user_metadata: options.data } },
              error: null,
            }),
        ),
      getUserById: jest
        .fn()
        .mockResolvedValue({ data: { user: account }, error: null }),
      deleteUser: jest.fn().mockResolvedValue({ error: null }),
    };
    recovery = jest.fn().mockResolvedValue({ error: null });
    jest
      .mocked(createClient)
      .mockClear()
      .mockReturnValue({
        auth: { admin, resetPasswordForEmail: recovery },
      } as unknown as ReturnType<typeof createClient>);
  });
  afterAll(() => {
    for (const [key, value] of Object.entries({
      SUPABASE_SECRET_KEY: original.secret,
      SUPABASE_URL: original.url,
      WEB_APP_URL: original.app,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  it('initializes lazily and fails closed without secret', async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    const service = new SupabaseAdminService();
    expect(createClient).not.toHaveBeenCalled();
    await expect(service.invite(input)).rejects.toMatchObject({ status: 503 });
    expect(createClient).not.toHaveBeenCalled();
  });
  it('creates only a proven-new identity with safe metadata and configured redirect', async () => {
    const result = await new SupabaseAdminService().invite(input);
    expect(result).toMatchObject({
      id: account.id,
      email: input.email,
    });
    expect(typeof result.operationId).toBe('string');
    expect(admin.inviteUserByEmail).toHaveBeenCalledWith(input.email, {
      redirectTo: 'http://localhost:3000/auth/invite',
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        companyName: input.companyName,
        invitationOperation: result.operationId,
      },
    });
    expect(createClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }),
    );
  });
  it('rejects existing unconfirmed accounts before sending any mail', async () => {
    admin.listUsers.mockResolvedValue({
      data: { users: [account] },
      error: null,
    });
    await expect(
      new SupabaseAdminService().invite(input),
    ).rejects.toMatchObject({ status: 409 });
    expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });
  it('rejects an account created concurrently that lacks this operation nonce', async () => {
    admin.inviteUserByEmail.mockResolvedValue({
      data: { user: account },
      error: null,
    });
    await expect(
      new SupabaseAdminService().invite(input),
    ).rejects.toMatchObject({ status: 409 });
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });
  it.each([
    ['email_exists', 422, 409],
    ['over_email_send_rate_limit', 429, 429],
    ['provider_error', 500, 503],
  ] as const)('sanitizes provider error %s', async (code, status, expected) => {
    admin.inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { code, status, message: 'private provider details' },
    });
    await expect(
      new SupabaseAdminService().invite(input),
    ).rejects.toMatchObject({ status: expected });
  });
  it('resends unconfirmed exact account using admin invite', async () => {
    admin.inviteUserByEmail.mockResolvedValue({
      data: { user: account },
      error: null,
    });
    await new SupabaseAdminService().resend(account.id, input.email);
    expect(admin.inviteUserByEmail).toHaveBeenCalledWith(input.email, {
      redirectTo: 'http://localhost:3000/auth/invite',
    });
    expect(recovery).not.toHaveBeenCalled();
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });
  it('uses supported password recovery after invite verification without onboarding completion', async () => {
    admin.getUserById.mockResolvedValue({
      data: {
        user: { ...account, email_confirmed_at: new Date().toISOString() },
      },
      error: null,
    });
    await new SupabaseAdminService().resend(account.id, input.email);
    expect(recovery).toHaveBeenCalledWith(input.email, {
      redirectTo: 'http://localhost:3000/auth/invite',
    });
    expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
  });
  it('resend refuses mismatched provider email', async () => {
    await expect(
      new SupabaseAdminService().resend(account.id, 'other@example.com'),
    ).rejects.toMatchObject({ status: 409 });
    expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(recovery).not.toHaveBeenCalled();
  });
  it.each([
    'preexisting',
    'confirmed',
    'signed-in',
    'different-email',
    'provider-failure',
  ])('never compensates %s identity', async (reason) => {
    admin.getUserById.mockResolvedValue({
      data: {
        user: {
          ...account,
          user_metadata: {
            invitationOperation:
              reason === 'preexisting' ? 'someone-else' : 'owned',
          },
          ...(reason === 'confirmed' ? { email_confirmed_at: 'date' } : {}),
          ...(reason === 'signed-in' ? { last_sign_in_at: 'date' } : {}),
          ...(reason === 'different-email'
            ? { email: 'different@example.com' }
            : {}),
        },
      },
      error: reason === 'provider-failure' ? { status: 500 } : null,
    });
    expect(
      await new SupabaseAdminService().compensate({
        id: account.id,
        email: input.email,
        operationId: 'owned',
      }),
    ).toBe(false);
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });
  it('compensates only owned, unconfirmed, never signed-in account', async () => {
    admin.getUserById.mockResolvedValue({
      data: {
        user: { ...account, user_metadata: { invitationOperation: 'owned' } },
      },
      error: null,
    });
    expect(
      await new SupabaseAdminService().compensate({
        id: account.id,
        email: input.email,
        operationId: 'owned',
      }),
    ).toBe(true);
    expect(admin.deleteUser).toHaveBeenCalledWith(account.id);
  });
  it.each([
    'http://unsafe.example',
    'https://example.com/path',
    'https://example.com?next=elsewhere',
    'https://user:password@example.com',
  ])('rejects unsafe WEB_APP_URL %s', async (app) => {
    process.env.WEB_APP_URL = app;
    await expect(
      new SupabaseAdminService().invite(input),
    ).rejects.toMatchObject({ status: 503 });
  });
});
