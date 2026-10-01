import { Module } from '@nestjs/common';
import { EmailAuthService } from './email-auth.service.js';
import { EmailAuthController } from './email-auth.controller.js';

@Module({
  providers: [EmailAuthService],
  controllers: [EmailAuthController],
})
export class EmailAuthModule {}
