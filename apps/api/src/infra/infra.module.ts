import { Global, Module } from '@nestjs/common';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { PrismaService } from './prisma.service';
import { RabbitMqService } from './rabbitmq.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [PrismaService, RedisService, RabbitMqService, RateLimiterService],
  exports: [PrismaService, RedisService, RabbitMqService, RateLimiterService],
})
export class InfraModule {}
