import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT Auth Guard — validates the Bearer token in the Authorization header.
 * Relies on the 'jwt' strategy registered via PassportModule + JwtModule.
 * Returns 401 Unauthorized if the token is missing or invalid.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
