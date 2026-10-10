import { Controller, Post, Body } from '@nestjs/common';
import { EmailAuthService } from './email-auth.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { SigninDto } from './dto/signin.dto.js';

@Controller('api/auth/email')
export class EmailAuthController {
  constructor(private readonly authService: EmailAuthService) {}

  @Post('signup')
  async signup(@Body() body: SignupDto) {
    console.log('Received signup request with body:', body);
    return this.authService.signUp(body.email, body.password);
  }

  @Post('signin')
  async signin(@Body() body: SigninDto) {
    return this.authService.signIn(body.email, body.password);
  }

  @Post('signout')
  async signout() {
    return this.authService.signOut();
  }
}
