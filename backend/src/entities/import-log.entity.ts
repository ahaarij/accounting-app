import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('import_log')
export class ImportLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 20 })
  file_type: string;

  @Column({ type: 'varchar', nullable: true })
  filename: string;

  @Column({ type: 'varchar', length: 10 })
  status: string;

  @Column({ type: 'int', default: 0 })
  records_imported: number;

  @Column({ type: 'jsonb', nullable: true })
  errors: any;

  @CreateDateColumn()
  created_at: Date;
}
