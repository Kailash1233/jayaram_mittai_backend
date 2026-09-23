import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { OrdersController } from './orders/orders.controller.js';
import { OrdersService } from './orders/orders.service.js';
import { RequestController } from './auth/otp/request/request.controller.js';
import { RequestService } from './auth/otp/request/request.service.js';
import { SupabaseModule } from './supabase/supabase.module.js';
import { ProductsController } from './catalog/products/products.controller.js';
import { ProductsService } from './catalog/products/products.service.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com

    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'jayaram_mittai-backend',
    }),
    SupabaseModule,
  ],
  controllers: [AppController, OrdersController, RequestController, ProductsController],
  providers: [AppService, OrdersService, RequestService, ProductsService],
})
export class AppModule {}
