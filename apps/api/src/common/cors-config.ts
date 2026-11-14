export function corsOrigins(env = process.env): string[] {
  const configured = env.CORS_ORIGINS?.trim();
  if (!configured && env.NODE_ENV === 'production')
    throw new Error(
      'CORS_ORIGINS must list exact HTTPS web origins in production.',
    );
  const origins = (configured || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim());
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (
        url.origin !== origin ||
        url.hostname.includes('*') ||
        !['http:', 'https:'].includes(url.protocol) ||
        (env.NODE_ENV === 'production' && url.protocol !== 'https:')
      )
        throw new Error();
    } catch {
      throw new Error(
        'CORS_ORIGINS must contain exact origins without wildcards, credentials, paths or queries; production requires HTTPS.',
      );
    }
  }
  return origins;
}
