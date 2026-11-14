/** Use the existing web recovery flow; never derive its host from document/user input. */
export function recoveryUrl(configured: string | undefined): string | null {
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    return new URL("/auth/forgot", url).toString();
  } catch {
    return null;
  }
}
