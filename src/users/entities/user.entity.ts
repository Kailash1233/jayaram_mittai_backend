import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  declare email: string;

  @Column({ type: 'varchar' })
  declare hashedPassword: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  declare role: UserRole;

  /**
   * Argon2 hash of the refresh token.
   * Null when the user is logged out.
   */
  @Column({ type: 'varchar', nullable: true, default: null })
  declare hashedRefreshToken: string | null;

  @CreateDateColumn()
  declare createdAt: Date;

  @UpdateDateColumn()
  declare updatedAt: Date;
}
