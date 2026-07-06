/**
 * Shape of the payload signed into both access and refresh tokens by
 * `TokenService`. This is the single source of truth for that shape -
 * `TokenService` re-exports this type instead of declaring its own copy,
 * and consumers (e.g. `SessionService.rotateRefreshToken`) import it from
 * here (via the `token` barrel) rather than redefining it inline.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
  iat?: number;
  exp?: number;
}
