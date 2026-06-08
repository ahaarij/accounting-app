import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async log(data: {
    user_id?: number;
    user_email?: string;
    user_name?: string;
    entity_type: string;
    description: string;
    ip_address?: string;
  }): Promise<void> {
    await this.repo.save(this.repo.create(data));
  }

  async getLogs(page = 1, limit = 100, entity_type?: string) {
    const qb = this.repo
      .createQueryBuilder('l')
      .orderBy('l.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (entity_type) qb.where('l.entity_type = :entity_type', { entity_type });
    const [logs, total] = await qb.getManyAndCount();
    return { logs, total, page, limit };
  }
}
