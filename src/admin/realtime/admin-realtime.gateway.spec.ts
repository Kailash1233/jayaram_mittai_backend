import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AdminRealtimeGateway } from './admin-realtime.gateway.js';

describe('AdminRealtimeGateway', () => {
  let gateway: AdminRealtimeGateway;
  const jwt = { verify: vi.fn() };
  const fakeServer = { emit: vi.fn() };

  const fakeClient = (overrides: Record<string, unknown> = {}) => ({
    id: 'client-1',
    handshake: { auth: {}, headers: {} },
    data: {},
    disconnect: vi.fn(),
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminRealtimeGateway,
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();
    gateway = module.get<AdminRealtimeGateway>(AdminRealtimeGateway);
    (gateway as unknown as { server: unknown }).server = fakeServer;
  });

  describe('handleConnection', () => {
    it('disconnects a client with no token', () => {
      const client = fakeClient();
      gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects a client whose token is invalid', () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('bad token');
      });
      const client = fakeClient({ handshake: { auth: { token: 'bad' }, headers: {} } });
      gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects a valid token that is not an admin', () => {
      jwt.verify.mockReturnValue({ sub: 'u1', role: 'customer' });
      const client = fakeClient({ handshake: { auth: { token: 'good' }, headers: {} } });
      gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('accepts a valid admin token from handshake.auth', () => {
      jwt.verify.mockReturnValue({ sub: 'admin-1', role: 'admin' });
      const client = fakeClient({ handshake: { auth: { token: 'good' }, headers: {} } });
      gateway.handleConnection(client as any);
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.data.admin).toEqual({ sub: 'admin-1', role: 'admin' });
    });

    it('accepts a valid admin token from the Authorization header', () => {
      jwt.verify.mockReturnValue({ sub: 'admin-1', role: 'admin' });
      const client = fakeClient({
        handshake: { auth: {}, headers: { authorization: 'Bearer good' } },
      });
      gateway.handleConnection(client as any);
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(jwt.verify).toHaveBeenCalledWith('good', expect.any(Object));
    });
  });

  describe('broadcasts', () => {
    it('notifyNewOrder emits order:new to every connected client', () => {
      const order = { id: 'ord_1' };
      gateway.notifyNewOrder(order);
      expect(fakeServer.emit).toHaveBeenCalledWith('order:new', order);
    });

    it('notifyOrderAcknowledged emits order:acknowledged with the order id', () => {
      gateway.notifyOrderAcknowledged('ord_1');
      expect(fakeServer.emit).toHaveBeenCalledWith('order:acknowledged', {
        orderId: 'ord_1',
      });
    });
  });
});
