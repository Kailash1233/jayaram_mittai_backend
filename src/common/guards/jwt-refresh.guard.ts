import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard for the POST /admin/auth/refresh endpoint.
 * Uses the 'jwt-refresh' strategy (JWT_REFRESH_SECRET).
 */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}
