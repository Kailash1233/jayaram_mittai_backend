import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SUPABASE_CLIENT } from '../supabase/supabase.module.js';
import { UserRole } from './entities/user.entity.js';
import { UsersService } from './users.service.js';
import type { UserRow } from './users.service.js';
import {
  createQueryBuilder,
  createSupabaseMock,
} from '../../test/utils/supabase-mock.js';

describe('UsersService', () => {
  let service: UsersService;
  const supabase = createSupabaseMock();

  const user: UserRow = {
    id: 'user-1',
    email: 'admin@jayarammittai.com',
    hashedPassword: 'hashed',
    role: UserRole.ADMIN,
    hashedRefreshToken: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: SUPABASE_CLIENT, useValue: supabase },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findByEmail', () => {
    it('looks up the user by email', async () => {
      const query = createQueryBuilder({ data: user });
      supabase.from.mockReturnValue(query);

      await expect(
        service.findByEmail('admin@jayarammittai.com'),
      ).resolves.toEqual(user);
      expect(supabase.from).toHaveBeenCalledWith('users');
      expect(query.eq).toHaveBeenCalledWith('email', 'admin@jayarammittai.com');
    });

    it('returns null when no user has that email', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: null }));

      await expect(service.findByEmail('nobody@x.com')).resolves.toBeNull();
    });

    it('throws InternalServerErrorException on a Supabase error', async () => {
      supabase.from.mockReturnValue(
        createQueryBuilder({ error: { message: 'connection lost' } }),
      );

      await expect(
        service.findByEmail('admin@jayarammittai.com'),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('findById', () => {
    it('looks up the user by id', async () => {
      const query = createQueryBuilder({ data: user });
      supabase.from.mockReturnValue(query);

      await expect(service.findById('user-1')).resolves.toEqual(user);
      expect(query.eq).toHaveBeenCalledWith('id', 'user-1');
    });

    it('throws NotFoundException when the id is missing', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: null }));

      await expect(service.findById('missing-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws InternalServerErrorException on a Supabase error', async () => {
      supabase.from.mockReturnValue(
        createQueryBuilder({ error: { message: 'connection lost' } }),
      );

      await expect(service.findById('user-1')).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe('create', () => {
    it('inserts a new user with the hashed password', async () => {
      const created = { ...user, id: 'user-2', email: 'new@admin.com' };
      const lookup = createQueryBuilder({ data: null });
      const insert = createQueryBuilder({ data: created });
      supabase.from.mockReturnValueOnce(lookup).mockReturnValueOnce(insert);

      await expect(
        service.create('new@admin.com', 'hashed-password', UserRole.ADMIN),
      ).resolves.toEqual(created);
      expect(insert.insert).toHaveBeenCalledWith({
        email: 'new@admin.com',
        hashedPassword: 'hashed-password',
        role: UserRole.ADMIN,
        hashedRefreshToken: null,
      });
    });

    it('defaults the role to USER', async () => {
      const insert = createQueryBuilder({ data: user });
      supabase.from
        .mockReturnValueOnce(createQueryBuilder({ data: null }))
        .mockReturnValueOnce(insert);

      await service.create('new@user.com', 'hashed-password');
      expect(insert.insert).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.USER }),
      );
    });

    it('throws ConflictException for a duplicate email without inserting', async () => {
      const lookup = createQueryBuilder({ data: user });
      supabase.from.mockReturnValue(lookup);

      await expect(
        service.create(user.email, 'hashed-password', UserRole.ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(lookup.insert).not.toHaveBeenCalled();
    });

    it('throws InternalServerErrorException when the insert fails', async () => {
      supabase.from
        .mockReturnValueOnce(createQueryBuilder({ data: null }))
        .mockReturnValueOnce(
          createQueryBuilder({ error: { message: 'insert failed' } }),
        );

      await expect(
        service.create('new@admin.com', 'hashed-password'),
      ).rejects.toThrow('Failed to create user: insert failed');
    });
  });

  describe('updateRefreshToken', () => {
    it('stores the hashed refresh token on the user', async () => {
      const query = createQueryBuilder({ data: null });
      supabase.from.mockReturnValue(query);

      await expect(
        service.updateRefreshToken('user-1', 'hashed-token'),
      ).resolves.toBeUndefined();
      expect(query.update).toHaveBeenCalledWith({
        hashedRefreshToken: 'hashed-token',
      });
      expect(query.eq).toHaveBeenCalledWith('id', 'user-1');
    });

    it('throws InternalServerErrorException on a Supabase error', async () => {
      supabase.from.mockReturnValue(
        createQueryBuilder({ error: { message: 'connection lost' } }),
      );

      await expect(
        service.updateRefreshToken('user-1', null),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });
});
