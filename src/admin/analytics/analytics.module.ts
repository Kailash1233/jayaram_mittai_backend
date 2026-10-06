import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import { JwtStrategy } from '../../common/strategies/jwt.strategy.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'fallback-secret',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, JwtStrategy],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
