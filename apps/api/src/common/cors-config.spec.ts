import { corsOrigins } from './cors-config';
describe('deployment CORS origins', () => {
  it('preserves local development and parses explicit production origins', () => {
    expect(corsOrigins({})).toEqual(['http://localhost:3000']);
    expect(
      corsOrigins({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.example.com, https://review.example.com:444',
      }),
    ).toEqual(['https://app.example.com', 'https://review.example.com:444']);
  });
  it.each([
    '',
    '*',
    'https://*.example.com',
    'http://app.example.com',
    'https://user:password@example.com',
    'https://example.com/path',
    'https://example.com?token=test',
    'https://example.com,',
  ])('fails closed for unsafe production origin %s', (origin) => {
    expect(() =>
      corsOrigins({ NODE_ENV: 'production', CORS_ORIGINS: origin }),
    ).toThrow('CORS_ORIGINS');
  });
});
