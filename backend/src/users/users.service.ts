import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../entities/user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}

  findAll() {
    return this.userRepo.find({ where: [{ status: 'active' }, { status: 'rejected' }], order: { createdAt: 'ASC' } });
  }

  findPending() {
    return this.userRepo.find({ where: { status: 'pending' }, order: { createdAt: 'ASC' } });
  }

  async approveUser(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    user.status = 'active';
    return this.userRepo.save(user);
  }

  async rejectUser(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    user.status = 'rejected';
    return this.userRepo.save(user);
  }

  async updateRole(id: number, role: UserRole, requestingRole: UserRole) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'super_admin') throw new ForbiddenException('Cannot change super admin role');
    if (role === 'super_admin') throw new ForbiddenException('Cannot assign super admin role');
    if (requestingRole !== 'super_admin' && (role === 'admin' || user.role === 'admin')) {
      throw new ForbiddenException('Only super admin can assign or remove admin role');
    }
    user.role = role;
    return this.userRepo.save(user);
  }

  async remove(id: number, requestingRole: UserRole) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'super_admin') throw new ForbiddenException('Cannot delete super admin');
    if (requestingRole !== 'super_admin' && user.role === 'admin') {
      throw new ForbiddenException('Only super admin can delete admins');
    }
    await this.userRepo.remove(user);
    return { deleted: true };
  }
}
