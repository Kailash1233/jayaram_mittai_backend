import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AdminDeliveryService } from './delivery.service.js';
import { ZonesController } from './zones.controller.js';
import { HoursController } from './hours.controller.js';
import { JwtStrategy } from '../../common/strategies/jwt.strategy.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'fallback-secret',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [ZonesController, HoursController],
  providers: [AdminDeliveryService, JwtStrategy],
  exports: [AdminDeliveryService],
})
export class AdminDeliveryModule {}
