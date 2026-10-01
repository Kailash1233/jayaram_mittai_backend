import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { AdminProductsModule } from './admin/products/products.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { EmailAuthModule } from './auth/email-auth/email-auth.module.js';
import { AddressService } from './Address/address.service.js';
import { AddressController } from './Address/address.controller.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Global Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
      ssl: { rejectUnauthorized: false },
      logging: process.env.NODE_ENV === 'development',
    }),

    // Observe
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY as string,
      appSecret: process.env.OBSERVE_APP_SECRET as string,
      serviceId: 'jayaram_mittai-backend',
    }),

    // Supabase
    SupabaseModule,

    // Email Authentication
    EmailAuthModule,

    // Admin feature modules
    AdminProductsModule,
    UsersModule,
    AuthModule,
  ],

  controllers: [
    AppController,
    OrdersController,
    RequestController,
    ProductsController,
    AddressController,
  ],

  providers: [
    AppService,
    OrdersService,
    RequestService,
    ProductsService,
    AddressService,
  ],
})
export class AppModule {}
