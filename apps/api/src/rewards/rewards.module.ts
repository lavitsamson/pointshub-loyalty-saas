import { Module } from '@nestjs/common';
import { RedemptionsService } from './redemptions.service';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

@Module({
  controllers: [RewardsController],
  providers: [RewardsService, RedemptionsService],
  exports: [RewardsService, RedemptionsService],
})
export class RewardsModule {}
