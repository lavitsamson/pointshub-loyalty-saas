import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RabbitMqService } from './rabbitmq.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [PrismaService, RedisService, RabbitMqService],
  exports: [PrismaService, RedisService, RabbitMqService],
})
export class InfraModule {}
