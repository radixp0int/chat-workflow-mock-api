import { Controller, Get, Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module.js';
import { WorkflowModule } from './workflow/workflow.module.js';
@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
@Module({ imports: [ChatModule, WorkflowModule], controllers: [HealthController] })
export class AppModule {}
