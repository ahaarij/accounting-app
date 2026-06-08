import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyProfile } from '../entities/company-profile.entity';
import { BuyerSupplier } from '../entities/buyer-supplier.entity';
import { CompanyPartyLink } from '../entities/company-party-link.entity';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyProfile, BuyerSupplier, CompanyPartyLink])],
  controllers: [CompaniesController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
