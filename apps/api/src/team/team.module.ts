import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  controllers: [TeamController, InvitationsController],
  providers: [TeamService, InvitationsService],
})
export class TeamModule {}
