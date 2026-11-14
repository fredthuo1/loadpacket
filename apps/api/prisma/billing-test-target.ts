/** No dotenv, DATABASE_URL, credentials output, or network access. */
export function billingTestDatasource(
  mode: string | undefined,
  connection: string | undefined,
): { url: string } | undefined {
  if (mode === 'offline') return undefined;
  if (mode !== 'isolated')
    throw new Error(
      'Set LOADPACKET_BILLING_CONFIG_MODE to offline or isolated.',
    );
  if (!connection)
    throw new Error('An explicit billing-test connection is required.');
  let url: URL;
  try {
    url = new URL(connection);
  } catch {
    throw new Error('Invalid billing-test connection.');
  }
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '55439' ||
    url.pathname !== '/loadpacket_billing_verified_test' ||
    !url.username ||
    !url.password ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw new Error(
      'Billing-test connection does not match the isolated allowlist.',
    );
  // Matching an address is NOT cluster verification or migration approval.
  return { url: connection };
}
