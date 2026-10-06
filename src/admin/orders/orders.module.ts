import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AdminOrdersController } from './orders.controller.js';
import { AdminOrdersService } from './orders.service.js';
import { JwtStrategy } from '../../common/strategies/jwt.strategy.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'fallback-secret',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AdminOrdersController],
  providers: [AdminOrdersService, JwtStrategy],
  exports: [AdminOrdersService],
})
export class AdminOrdersModule {}
