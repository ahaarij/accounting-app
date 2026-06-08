import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('processed_emails')
export class ProcessedEmail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true })
  message_id: string;

  @Column({ type: 'varchar' })
  filename: string;

  @CreateDateColumn()
  imported_at: Date;

  @Column({ type: 'varchar' })
  import_type: string;

  @Column({ type: 'int', default: 0 })
  records_imported: number;

  @Column({ type: 'varchar', nullable: true })
  error: string | null;
}
