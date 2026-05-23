import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('sales_invoices')
export class SalesInvoice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  source_company: string;

  @Column({ type: 'varchar', nullable: true })
  customer_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  voucher_no: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  voucher_ref_no: string;

  @Column({ type: 'date', nullable: true })
  invoice_date: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  gross_total: number;

  @Column({ type: 'text', nullable: true })
  product: string;

  @Column({ type: 'varchar', length: 10, default: 'AED' })
  currency: string;

  @Column({ type: 'boolean', default: false })
  is_cancelled: boolean;

  @Column({ type: 'varchar', nullable: true })
  filename: string;

  @Column({ type: 'date' })
  import_date: string;

  @CreateDateColumn()
  created_at: Date;
}
