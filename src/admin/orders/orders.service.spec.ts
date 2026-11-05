import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SUPABASE_ADMIN_CLIENT } from '../../supabase/supabase.module.js';
import { AdminRealtimeGateway } from '../realtime/admin-realtime.gateway.js';
import { AdminOrdersService } from './orders.service.js';
import {
  createQueryBuilder,
  createSupabaseMock,
} from '../../../test/utils/supabase-mock.js';

describe('AdminOrdersService', () => {
  let service: AdminOrdersService;
  const supabase = createSupabaseMock();
  const realtime = { notifyNewOrder: vi.fn(), notifyOrderAcknowledged: vi.fn() };

  const build = async (admin: unknown = supabase) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOrdersService,
        { provide: SUPABASE_ADMIN_CLIENT, useValue: admin },
        { provide: AdminRealtimeGateway, useValue: realtime },
      ],
    }).compile();
    return module.get<AdminOrdersService>(AdminOrdersService);
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    supabase.from.mockReset();
    service = await build();
  });

  describe('findAll', () => {
    it('lists every order newest first', async () => {
      const orders = [{ id: 'ord_2' }, { id: 'ord_1' }];
      const query = createQueryBuilder({ data: orders });
      supabase.from.mockReturnValue(query);

      await expect(service.findAll()).resolves.toEqual(orders);
      expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('filters by a valid status', async () => {
      const query = createQueryBuilder({ data: [] });
      supabase.from.mockReturnValue(query);

      await service.findAll('confirmed');

      expect(query.eq).toHaveBeenCalledWith('status', 'confirmed');
    });

    it('rejects an invalid status filter', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: [] }));

      await expect(service.findAll('bogus')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws when the query fails', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ error: { message: 'db down' } }));

      await expect(service.findAll()).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });

    it('returns 503 when the secret key is not configured', async () => {
      const withoutAdmin = await build(null);
      await expect(withoutAdmin.findAll()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('findOne', () => {
    it('returns the matching order', async () => {
      const order = { id: 'ord_1' };
      supabase.from.mockReturnValue(createQueryBuilder({ data: order }));

      await expect(service.findOne('ord_1')).resolves.toEqual(order);
    });

    it('throws NotFoundException when missing', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: null }));

      await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('updates the status and silences the alert bell for this order', async () => {
      const updated = { id: 'ord_1', status: 'preparing' };
      supabase.from.mockReturnValue(createQueryBuilder({ data: updated }));

      await expect(service.updateStatus('ord_1', 'preparing')).resolves.toEqual(updated);
      expect(realtime.notifyOrderAcknowledged).toHaveBeenCalledWith('ord_1');
    });

    it('rejects an invalid status', async () => {
      await expect(service.updateStatus('ord_1', 'bogus')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(realtime.notifyOrderAcknowledged).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when nothing was updated, without silencing anything', async () => {
      supabase.from.mockReturnValue(createQueryBuilder({ data: null }));

      await expect(service.updateStatus('nope', 'preparing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(realtime.notifyOrderAcknowledged).not.toHaveBeenCalled();
    });

    it('throws when the update fails', async () => {
      supabase.from.mockReturnValue(
        createQueryBuilder({ error: { message: 'db down' } }),
      );

      await expect(service.updateStatus('ord_1', 'preparing')).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});
