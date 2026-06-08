import { Injectable, ConflictException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(name: string, email: string, password: string): Promise<{ message: string }> {
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(password, 10);
    await this.userRepo.save(this.userRepo.create({ name, email, passwordHash, role: 'user', status: 'pending' }));
    return { message: 'Registration submitted. An admin will review your request.' };
  }

  async login(email: string, password: string): Promise<{ access_token: string }> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    if (user.status === 'pending') throw new ForbiddenException('Your account is pending approval by an administrator.');
    if (user.status === 'rejected') throw new ForbiddenException('Your account registration was declined. Contact an administrator.');
    return { access_token: this.jwtService.sign({ sub: user.id, email: user.email, role: user.role, name: user.name }) };
  }
}
