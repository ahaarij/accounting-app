import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from '../entities/app-setting.entity';

const SENSITIVE = new Set(['smtp_pass']);

@Injectable()
export class AppSettingsService {
  constructor(
    @InjectRepository(AppSetting) private readonly repo: Repository<AppSetting>,
  ) {}

  async getAll(): Promise<Record<string, string | null>> {
    const rows = await this.repo.find();
    const out: Record<string, string | null> = {};
    for (const row of rows) {
      out[row.key] = SENSITIVE.has(row.key) ? (row.value ? '__set__' : null) : row.value;
    }
    return out;
  }

  async get(key: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row?.value ?? null;
  }

  async setMany(settings: Record<string, string>): Promise<void> {
    const entries = Object.entries(settings).filter(([, v]) => v !== '__set__');
    if (!entries.length) return;
    await Promise.all(
      entries.map(([key, value]) =>
        this.repo.upsert({ key, value: value === '' ? null : value }, ['key']),
      ),
    );
  }
}
