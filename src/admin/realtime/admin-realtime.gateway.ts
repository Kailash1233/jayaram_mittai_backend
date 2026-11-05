import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

function resolveCorsOrigin(): boolean | string[] {
  const originEnv = process.env.CORS_ORIGIN ?? '*';
  return originEnv === '*' ? true : originEnv.split(',').map((s) => s.trim());
}

/**
 * Pushes live order events to connected admin dashboards, so staff see a new
 * paid order the instant it arrives (no polling). Namespace clients must
 * authenticate with an admin JWT (same token used for the REST admin API),
 * sent as `{ auth: { token } }` on connect.
 *
 * Single backend instance only: events are broadcast in-process. Running
 * more than one backend instance would need a shared pub/sub (e.g. Redis)
 * for every instance's connected clients to see every instance's events.
 */
@WebSocketGateway({
  namespace: 'admin/realtime',
  cors: { origin: resolveCorsOrigin(), credentials: true },
})
export class AdminRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(AdminRealtimeGateway.name);

  constructor(private readonly jwt: JwtService) {}

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers.authorization?.toString().replace(/^Bearer\s+/i, ''));

    if (!token) {
      this.logger.warn(`Rejected connection ${client.id}: no token.`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwt.verify<{ sub: string; role: string }>(token, {
        secret: process.env.JWT_ACCESS_SECRET ?? 'fallback-secret',
      });
      if (payload.role !== 'admin') {
        client.disconnect(true);
        return;
      }
      client.data.admin = payload;
    } catch {
      this.logger.warn(`Rejected connection ${client.id}: invalid token.`);
      client.disconnect(true);
    }
  }

  handleDisconnect() {
    // Nothing to clean up: no per-connection state is kept.
  }

  /** A new paid order just came in — ring every connected admin screen. */
  notifyNewOrder(order: Record<string, unknown>) {
    this.server?.emit('order:new', order);
  }

  /** Staff accepted (or cancelled) this order on one screen — silence it on all. */
  notifyOrderAcknowledged(orderId: string) {
    this.server?.emit('order:acknowledged', { orderId });
  }
}
