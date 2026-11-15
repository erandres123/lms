import { Module } from '@nestjs/common';
import { GuardianController } from './guardian.controller';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';
import { SupabaseAdminService } from './supabase-admin.service';

@Module({
  controllers: [PrivacyController, GuardianController],
  providers: [PrivacyService, SupabaseAdminService],
})
export class PrivacyModule {}
