import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService, AuthResponse, TokenPair } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtRefreshGuard } from '../common/guards/jwt-refresh.guard.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    email: string;
    role: string;
    refreshToken?: string;
  };
}

/**
 * Admin Auth Controller
 *
 * Base route: /admin/auth  ← admin-only, separate from user auth (/auth/*)
 *
 * POST /admin/auth/register  — create new admin (existing admin JWT required)
 * POST /admin/auth/login     — admin sign in (public)
 * POST /admin/auth/refresh   — rotate tokens (refresh JWT required)
 * POST /admin/auth/logout    — invalidate refresh token (access JWT required)
 */
@Controller('admin/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /admin/auth/register
   * Requires an existing admin JWT — only admins can create new admin accounts.
   * The first admin must be seeded directly in the database.
   */
  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto);
  }

  /**
   * POST /admin/auth/login
   * Public — returns access token (15 min) + refresh token (7 days).
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto);
  }

  /**
   * POST /admin/auth/refresh
   * Requires: Authorization: Bearer <refresh_token>
   * Returns a new access token and rotates the refresh token.
   */
  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  async refresh(@Request() req: RequestWithUser): Promise<TokenPair> {
    const { sub: userId, refreshToken } = req.user;
    return this.authService.refresh(userId, refreshToken!);
  }

  /**
   * POST /admin/auth/logout
   * Requires: Authorization: Bearer <access_token>
   * Clears the refresh token from DB — next refresh attempt will fail.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Request() req: RequestWithUser,
  ): Promise<{ message: string }> {
    return this.authService.logout(req.user.sub);
  }
}
