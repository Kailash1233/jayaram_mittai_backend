import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { User, UserRole } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  private readonly users = new Map<string, User>();

  /**
   * Find a user by their email address.
   * Returns null if not found (caller decides how to handle).
   */
  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  /**
   * Find a user by their ID.
   * Throws NotFoundException if not found.
   */
  async findById(id: string): Promise<User> {
    const user = this.users.get(id);
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

    const user = Object.assign(new User(), {
      id: randomUUID(),
      email,
      hashedPassword,
      role,
      hashedRefreshToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.users.set(user.id, user);
    return user;
  }

  /**
   * Store or clear the hashed refresh token on the user record.
   * Pass null to log the user out (invalidate their refresh token).
   */
  async updateRefreshToken(
    userId: string,
    hashedRefreshToken: string | null,
  ): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    user.hashedRefreshToken = hashedRefreshToken;
    user.updatedAt = new Date();
  }
}
