import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { OrdersController } from './orders/orders.controller.js';
import { OrdersService } from './orders/orders.service.js';
import { RequestController } from './auth/otp/request/request.controller.js';
import { RequestService } from './auth/otp/request/request.service.js';
import { SupabaseModule } from './supabase/supabase.module.js';
import { ProductsController } from './catalog/products/products.controller.js';
import { ProductsService } from './catalog/products/products.service.js';
import { AdminProductsModule } from './admin/products/products.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import databaseConfig from './config/database.config.js';



@Module({
  imports: [
    // ── Global Config ─────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      envFilePath: '.env',
    }),



    // ── Supabase JS client (catalog, orders, OTP auth) ────────────────────
    SupabaseModule,

    // ── Postgres via TypeORM (admin users, admin products) ────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        ...configService.get('database'),
      }),
      inject: [ConfigService],
    }),

    // ── Admin feature modules ─────────────────────────────────────────────
    AdminProductsModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [
    AppController,
    OrdersController,
    RequestController,
    ProductsController,
  ],
  providers: [AppService, OrdersService, RequestService, ProductsService],
})
export class AppModule {}
