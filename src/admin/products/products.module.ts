import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AdminProductsController } from './products.controller.js';
import { AdminProductsService } from './products.service.js';
import { JwtStrategy } from '../../common/strategies/jwt.strategy.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'fallback-secret',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AdminProductsController],
  providers: [AdminProductsService, JwtStrategy],
  exports: [AdminProductsService],
})
export class AdminProductsModule {}
