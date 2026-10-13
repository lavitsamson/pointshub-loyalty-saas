import { Global, Module } from '@nestjs/common';
import { OutboxService } from '../outbox/outbox.service';
import { AdjustmentsService } from './adjustments.service';
import { LedgerService } from './ledger.service';
import { PointsController } from './points.controller';
import { PurchasesService } from './purchases.service';

@Global()
@Module({
  controllers: [PointsController],
  providers: [OutboxService, LedgerService, PurchasesService, AdjustmentsService],
  exports: [OutboxService, LedgerService, AdjustmentsService],
})
export class PointsModule {}
