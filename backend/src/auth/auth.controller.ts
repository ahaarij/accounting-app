import { Controller, Post, Body, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { MailService } from '../mail/mail.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

class RegisterDto {
  @IsString() @MinLength(1) @MaxLength(255) name: string;
  @IsEmail() @MaxLength(255) email: string;
  @IsString() @MinLength(6) @MaxLength(128) password: string;
}

class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

class ForgotPasswordDto {
  @IsEmail() email: string;
}

class ResetPasswordDto {
  @IsString() @MinLength(1) token: string;
  @IsString() @MinLength(6) @MaxLength(128) password: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mailService: MailService,
  ) {}

  // 5 registrations per 10 minutes per IP
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.name, dto.email, dto.password);
  }

  // 20 login attempts per minute per IP — generous for humans, blocks brute force
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto.email, dto.password, req.ip);
  }

  // 5 requests per 10 minutes per IP
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    // Always return the same response to prevent email enumeration
    return { message: 'If that email is registered, a reset link has been sent.' };
  }

  // 10 attempts per 10 minutes per IP
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @Post('test-email')
  @HttpCode(HttpStatus.OK)
  async testEmail(@Req() req: Request & { user: { email: string } }) {
    await this.mailService.sendTestEmail(req.user.email);
    return { message: `Test email sent to ${req.user.email}` };
  }
}
