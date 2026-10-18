import { Controller, Headers, HttpCode, Post, type RawBodyRequest, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public, ReqMeta, type RequestMeta } from '../auth/decorators';
import { SkipCsrf } from '../common/http/csrf.guard';
import { StripeWebhookService, type WebhookOutcome } from './stripe-webhook.service';

/** Called by Stripe, not browsers: authenticated by the signature over the raw body. */
@ApiTags('billing')
@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(private readonly webhooks: StripeWebhookService) {}

  @Post()
  @ApiOperation({ summary: 'Stripe webhook endpoint (verified by the Stripe-Signature header)' })
  @Public()
  @SkipCsrf()
  @HttpCode(200)
  receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
    @ReqMeta() meta: RequestMeta,
  ): Promise<WebhookOutcome> {
    const event = this.webhooks.verify(req.rawBody, signature);
    return this.webhooks.handle(event, meta);
  }
}
