import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service.js';
import { UserRole } from '../users/entities/user.entity.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends TokenPair {
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  // ── Register ─────────────────────────────────────────────────────────────

  /**
   * Create a new admin account.
   * Only callable by an existing admin (enforced in controller).
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create(
      dto.email,
      hashedPassword,
      UserRole.ADMIN, // Auth system is admin-only
    );

    const tokens = await this.generateAndStoreTokens(
      user.id,
      user.email,
      user.role,
    );

    return {
      ...tokens,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  /**
   * Validate credentials and return token pair.
   * Uses a generic error message to prevent user enumeration.
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);

    // Generic error — don't reveal whether email exists
    const invalidCredentials = new UnauthorizedException(
      'Invalid email or password.',
    );

    if (!user) throw invalidCredentials;

    const passwordValid = await bcrypt.compare(
      dto.password,
      user.hashedPassword,
    );
    if (!passwordValid) throw invalidCredentials;

    const tokens = await this.generateAndStoreTokens(
      user.id,
      user.email,
      user.role,
    );

    return {
      ...tokens,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  // ── Refresh ───────────────────────────────────────────────────────────────

  /**
   * Verify the provided refresh token against the DB hash,
   * then rotate it: invalidate old, issue a new pair.
   */
  async refresh(userId: string, refreshToken: string): Promise<TokenPair> {
    const user = await this.usersService.findById(userId);

    if (!user.hashedRefreshToken) {
      throw new ForbiddenException(
        'Refresh token has been revoked. Please log in again.',
      );
    }

    const tokenMatches = await bcrypt.compare(
      refreshToken,
      user.hashedRefreshToken,
    );
    if (!tokenMatches) {
      // Possible token reuse attack — invalidate all tokens
      await this.usersService.updateRefreshToken(userId, null);
      throw new ForbiddenException(
        'Refresh token is invalid or has already been used.',
      );
    }

    // Rotate: generate new pair and store the new hashed refresh token
    return this.generateAndStoreTokens(user.id, user.email, user.role);
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  /**
   * Invalidate the user's refresh token — next refresh attempt will fail.
   */
  async logout(userId: string): Promise<{ message: string }> {
    await this.usersService.updateRefreshToken(userId, null);
    return { message: 'Logged out successfully.' };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Sign both tokens, hash the refresh token, persist the hash, return the pair.
   */
  private async generateAndStoreTokens(
    userId: string,
    email: string,
    role: UserRole,
  ): Promise<TokenPair> {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: parseInt(process.env.JWT_ACCESS_EXPIRY ?? '900', 10),
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: parseInt(process.env.JWT_REFRESH_EXPIRY ?? '604800', 10),
      }),
    ]);

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 12);
    await this.usersService.updateRefreshToken(userId, hashedRefreshToken);

    return { accessToken, refreshToken };
  }
}
