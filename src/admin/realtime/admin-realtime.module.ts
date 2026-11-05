import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminRealtimeGateway } from './admin-realtime.gateway.js';

/**
 * Global so AdminOrdersService and PaymentsService can push events without
 * each importing this module directly (same pattern as SupabaseModule).
 */
@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET ?? 'fallback-secret',
    }),
  ],
  providers: [AdminRealtimeGateway],
  exports: [AdminRealtimeGateway],
})
export class AdminRealtimeModule {}
