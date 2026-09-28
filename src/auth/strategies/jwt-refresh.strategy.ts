import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

export interface RefreshJwtPayload {
  sub: string;
  email: string;
  role: string;
}

/**
 * JWT Refresh Strategy — separate strategy for the refresh endpoint.
 * - Uses JWT_REFRESH_SECRET (different from access secret)
 * - Extracts refresh token from Authorization: Bearer header
 * - Attaches { ...payload, refreshToken } to req.user
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_REFRESH_SECRET ?? 'fallback-refresh-secret',
      passReqToCallback: true,
    });
  }

  validate(
    req: Request,
    payload: RefreshJwtPayload,
  ): RefreshJwtPayload & { refreshToken: string } {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('No refresh token provided.');
    }
    const refreshToken = authHeader.replace('Bearer ', '').trim();
    return { ...payload, refreshToken };
  }
}
