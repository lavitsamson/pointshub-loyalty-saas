import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { RewardsModule } from '../rewards/rewards.module';
import { PortalAuthController } from './portal-auth.controller';
import { PortalAuthService } from './portal-auth.service';
import { PortalController } from './portal.controller';
import { CustomerSessionGuard, PortalTenantGuard } from './portal.guards';
import { PortalService } from './portal.service';

@Module({
  imports: [CustomersModule, RewardsModule],
  controllers: [PortalAuthController, PortalController],
  providers: [PortalAuthService, PortalService, PortalTenantGuard, CustomerSessionGuard],
})
export class PortalModule {}
