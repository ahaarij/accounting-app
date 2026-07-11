import { Injectable, ConflictException, UnauthorizedException, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from '../entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  async register(name: string, email: string, password: string): Promise<{ message: string }> {
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(password, 10);
    await this.userRepo.save(this.userRepo.create({ name, email, passwordHash, role: 'user', status: 'pending' }));
    return { message: 'Registration submitted. An admin will review your request.' };
  }

  async login(email: string, password: string, ip?: string): Promise<{ access_token: string }> {
    const user = await this.userRepo.findOne({
      where: { email },
      select: ['id', 'name', 'email', 'passwordHash', 'role', 'status'],
    });
    if (!user) {
      await this.logAttempt(email, ip, 'Failed login (unknown email)');
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.logAttempt(email, ip, 'Failed login (wrong password)', user);
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status === 'pending') throw new ForbiddenException('Your account is pending approval by an administrator.');
    if (user.status === 'rejected') throw new ForbiddenException('Your account registration was declined. Contact an administrator.');
    await this.logAttempt(email, ip, 'Successful login', user);
    return { access_token: this.jwtService.sign({ sub: user.id, email: user.email, role: user.role, name: user.name }) };
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { email } });
    // Always resolve silently to prevent email enumeration
    if (!user || user.status !== 'active') return;

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.userRepo.update(user.id, { resetToken: token, resetTokenExpiresAt: expires });

    try {
      await this.mailService.sendPasswordReset(user.email, user.name, token);
    } catch {
      // Don't expose mail errors to the caller; log in audit
      await this.auditService.log({
        user_id: user.id,
        user_email: user.email,
        user_name: user.name,
        entity_type: 'auth',
        description: 'Password reset email failed to send — check SMTP settings',
        ip_address: undefined,
      }).catch(() => {});
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    if (!token || token.length < 32) throw new BadRequestException('Invalid token');

    const user = await this.userRepo.findOne({
      where: { resetToken: token },
      select: { id: true, email: true, name: true, resetToken: true, resetTokenExpiresAt: true },
    });

    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      throw new BadRequestException('Reset link is invalid or has expired. Please request a new one.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepo.update(user.id, {
      passwordHash,
      resetToken: null,
      resetTokenExpiresAt: null,
    });

    await this.auditService.log({
      user_id: user.id,
      user_email: user.email,
      user_name: user.name,
      entity_type: 'auth',
      description: 'Password reset successfully',
      ip_address: undefined,
    }).catch(() => {});

    return { message: 'Password updated. You can now sign in with your new password.' };
  }

  private async logAttempt(email: string, ip: string | undefined, description: string, user?: User) {
    try {
      await this.auditService.log({
        user_id: user?.id,
        user_email: email,
        user_name: user?.name,
        entity_type: 'auth',
        description,
        ip_address: ip,
      });
    } catch {
      // never block a login on audit failure
    }
  }
}
