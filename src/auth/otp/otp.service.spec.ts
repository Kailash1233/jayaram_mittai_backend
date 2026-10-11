import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { SUPABASE_CLIENT_FACTORY } from '../../supabase/supabase.module.js';
import { OtpService } from './otp.service.js';

describe('OtpService', () => {
  let service: OtpService;
  const auth = {
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    refreshSession: vi.fn(),
    admin: { signOut: vi.fn() },
  };
  const clients = {
    createAnonymous: vi.fn(() => ({ auth })),
    createForUser: vi.fn(),
  };

  const session = {
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    expires_in: 3600,
    expires_at: 1790000000,
    token_type: 'bearer',
    user: { id: 'customer-1', phone: '919840012345', email: '' },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: SUPABASE_CLIENT_FACTORY, useValue: clients },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
  });

  it('uses a fresh client for every call, never a shared one', async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    auth.verifyOtp.mockResolvedValue({ data: { session }, error: null });

    await service.requestOtp('+919840012345');
    await service.verifyOtp('+919840012345', '123456');

    expect(clients.createAnonymous).toHaveBeenCalledTimes(2);
  });

  describe('requestOtp', () => {
    it('sends an SMS OTP and creates the customer if new', async () => {
      auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });

      await expect(service.requestOtp('+919840012345')).resolves.toEqual({
        message: 'OTP sent.',
      });
      expect(auth.signInWithOtp).toHaveBeenCalledWith({
        phone: '+919840012345',
        options: { shouldCreateUser: true },
      });
    });

    it('returns 429 when Supabase rate-limits', async () => {
      auth.signInWithOtp.mockResolvedValue({
        data: {},
        error: { message: 'rate limit', status: 429 },
      });

      await expect(service.requestOtp('+919840012345')).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });

    it('returns 400 for other Supabase errors', async () => {
      auth.signInWithOtp.mockResolvedValue({
        data: {},
        error: { message: 'Unsupported phone provider', status: 400 },
      });

      const result = service.requestOtp('+919840012345');
      await expect(result).rejects.toBeInstanceOf(BadRequestException);
      await expect(result).rejects.toThrow(
        'Could not send OTP: Unsupported phone provider',
      );
    });
  });

  describe('verifyOtp', () => {
    it('verifies an SMS code and returns the session', async () => {
      auth.verifyOtp.mockResolvedValue({ data: { session }, error: null });

      await expect(
        service.verifyOtp('+919840012345', '123456'),
      ).resolves.toEqual({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 3600,
        expires_at: 1790000000,
        token_type: 'bearer',
        user: { id: 'customer-1', phone: '919840012345' },
      });
      expect(auth.verifyOtp).toHaveBeenCalledWith({
        phone: '+919840012345',
        token: '123456',
        type: 'sms',
      });
    });

    it('returns 401 for a wrong or expired code', async () => {
      auth.verifyOtp.mockResolvedValue({
        data: { session: null },
        error: { message: 'Token has expired or is invalid', status: 403 },
      });

      await expect(
        service.verifyOtp('+919840012345', '000000'),
      ).rejects.toThrow(new UnauthorizedException('Invalid or expired OTP.'));
    });
  });

  describe('refresh', () => {
    it('returns a new session for a valid refresh token', async () => {
      auth.refreshSession.mockResolvedValue({ data: { session }, error: null });

      await expect(service.refresh('refresh-0')).resolves.toMatchObject({
        access_token: 'access-1',
      });
      expect(auth.refreshSession).toHaveBeenCalledWith({
        refresh_token: 'refresh-0',
      });
    });

    it('returns 401 for an invalid refresh token', async () => {
      auth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid Refresh Token', status: 400 },
      });

      await expect(service.refresh('bad')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it("ends only this customer's current session", async () => {
      auth.admin.signOut.mockResolvedValue({ data: null, error: null });

      await expect(service.logout('access-1')).resolves.toEqual({
        message: 'Logged out.',
      });
      expect(auth.admin.signOut).toHaveBeenCalledWith('access-1', 'local');
    });
  });
});
