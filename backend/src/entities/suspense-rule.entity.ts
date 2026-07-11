import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// A remembered classification for suspense transactions: any imported transaction
// whose normalised description equals match_text is auto-assigned this label and
// type instead of landing in suspense.
@Entity('suspense_rules')
export class SuspenseRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', unique: true })
  match_text: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  label: string | null;

  @Column({ type: 'varchar', length: 100 })
  transaction_type: string;

  @CreateDateColumn()
  created_at: Date;
}
