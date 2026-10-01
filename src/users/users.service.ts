import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Find a user by their email address.
   * Returns null if not found (caller decides how to handle).
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOneBy({ email });
  }

  /**
   * Find a user by their ID.
   * Throws NotFoundException if not found.
   */
  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }

  /**
   * Create a new user with an already-hashed password.
   * Throws ConflictException if the email already exists.
   */
  async create(
    email: string,
    hashedPassword: string,
    role: UserRole = UserRole.USER,
  ): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const user = this.userRepository.create({
      email,
      hashedPassword,
      role,
      hashedRefreshToken: null,
    });

    return this.userRepository.save(user);
  }

  /**
   * Store or clear the hashed refresh token on the user record.
   * Pass null to log the user out (invalidate their refresh token).
   */
  async updateRefreshToken(
    userId: string,
    hashedRefreshToken: string | null,
  ): Promise<void> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    user.hashedRefreshToken = hashedRefreshToken;
    user.updatedAt = new Date();
    await this.userRepository.save(user);
  }
}
