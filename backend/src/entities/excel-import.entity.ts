import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { ExcelAccount } from './excel-account.entity';

@Entity('excel_imports')
export class ExcelImport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ type: 'char', length: 2, nullable: true })
  group: string;

  @Column({ type: 'int', default: 0 })
  account_count: number;

  @CreateDateColumn({ type: 'timestamptz' })
  imported_at: Date;

  @OneToMany(() => ExcelAccount, a => a.import)
  accounts: ExcelAccount[];
}
