import { Module } from '@nestjs/common';
import { OtpController } from './otp.controller.js';
import { OtpService } from './otp.service.js';

@Module({
  controllers: [OtpController],
  providers: [OtpService],
})
export class OtpModule {}
