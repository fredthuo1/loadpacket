export abstract class TokenVerifier {
  abstract verify(
    token: string,
  ): Promise<{ sub: string; passwordAuthenticatedAt?: number }>;
}
