import { Module } from '@nestjs/common';
import Stripe from 'stripe';
import { ENV, type Env } from '../config/env';
import { BILLING_GATEWAY, StripeBillingGateway } from './billing-gateway';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';

@Module({
  controllers: [BillingController, StripeWebhookController],
  providers: [
    {
      provide: BILLING_GATEWAY,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.STRIPE_SECRET_KEY && env.STRIPE_PRO_PRICE_ID
          ? new StripeBillingGateway(new Stripe(env.STRIPE_SECRET_KEY), env.STRIPE_PRO_PRICE_ID)
          : null,
    },
    BillingService,
    StripeWebhookService,
  ],
})
export class BillingModule {}
