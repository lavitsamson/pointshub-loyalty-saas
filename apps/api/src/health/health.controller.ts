import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import type { Response } from 'express';
import { HealthService, type ReadinessReport } from './health.service';

@Public()
@ApiTags('ops')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness: the process is up and serving HTTP' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: database, Redis and RabbitMQ are reachable' })
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessReport> {
    const report = await this.health.readiness();
    if (report.status !== 'ok') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
