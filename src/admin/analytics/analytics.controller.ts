import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

/**
 * Admin Analytics Controller
 *
 * Base route: /admin/analytics
 * All routes require a valid JWT token with role === 'admin'.
 */
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * GET /admin/analytics/sales
   * GET /admin/analytics/sales?from=2026-01-01&to=2026-12-31
   *
   * Returns sales analytics: revenue summary, top products,
   * daily trends, payment method and status breakdowns.
   *
   * @param from - Optional ISO date lower bound (YYYY-MM-DD)
   * @param to   - Optional ISO date upper bound (YYYY-MM-DD)
   */
  @Get('sales')
  @HttpCode(HttpStatus.OK)
  async getSales(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getSalesAnalytics(from, to);
  }

  /**
   * GET /admin/analytics/stock-outs
   * GET /admin/analytics/stock-outs?threshold=5
   *
   * Returns products that are out of stock or below the given threshold.
   * Defaults to threshold=10.
   *
   * @param threshold - Stock level at or below which a product is flagged
   */
  @Get('stock-outs')
  @HttpCode(HttpStatus.OK)
  async getStockOuts(@Query('threshold') threshold?: string) {
    const parsed = threshold ? parseInt(threshold, 10) : 10;
    return this.analyticsService.getStockOuts(parsed);
  }

  /**
   * GET /admin/analytics/zones
   * GET /admin/analytics/zones?from=2026-01-01&to=2026-12-31
   *
   * Returns per-delivery-zone breakdown:
   * order count, revenue, avg order value, status breakdown.
   *
   * @param from - Optional ISO date lower bound (YYYY-MM-DD)
   * @param to   - Optional ISO date upper bound (YYYY-MM-DD)
   */
  @Get('zones')
  @HttpCode(HttpStatus.OK)
  async getZones(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getZoneAnalytics(from, to);
  }
}
