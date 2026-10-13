import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { MAIL_TRANSPORT, SmtpMailTransport } from './mail-transport';
import { MailService } from './mail.service';

@Global()
@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ENV],
      useFactory: (env: Env) => new SmtpMailTransport(env),
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
