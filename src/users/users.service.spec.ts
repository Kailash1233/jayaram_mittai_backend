import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, UserRole } from './entities/user.entity.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;
  const repo = {
    findOneBy: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: repo,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('finds a user by email from the repository', async () => {
    const user = {
      id: 'user-1',
      email: 'admin@jayarammittai.com',
      hashedPassword: 'hashed',
      role: UserRole.ADMIN,
    } as User;

    repo.findOneBy.mockResolvedValue(user);

    await expect(
      service.findByEmail('admin@jayarammittai.com'),
    ).resolves.toEqual(user);
    expect(repo.findOneBy).toHaveBeenCalledWith({
      email: 'admin@jayarammittai.com',
    });
  });

  it('creates a new user with a hashed password', async () => {
    const user = {
      id: 'user-2',
      email: 'new@admin.com',
      hashedPassword: 'hashed-password',
      role: UserRole.ADMIN,
      hashedRefreshToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    repo.findOneBy.mockResolvedValue(null);
    repo.create.mockReturnValue(user);
    repo.save.mockResolvedValue(user);

    await expect(
      service.create('new@admin.com', 'hashed-password', UserRole.ADMIN),
    ).resolves.toEqual(user);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@admin.com',
        hashedPassword: 'hashed-password',
        role: UserRole.ADMIN,
      }),
    );
  });

  it('throws when creating a duplicate email', async () => {
    repo.findOneBy.mockResolvedValue({
      id: 'existing',
      email: 'dup@admin.com',
    } as User);

    await expect(
      service.create('dup@admin.com', 'hashed-password', UserRole.ADMIN),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws when user id is missing', async () => {
    repo.findOneBy.mockResolvedValue(null);

    await expect(service.findById('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
