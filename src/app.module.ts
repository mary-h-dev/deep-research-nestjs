import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiDeepSearchModule } from './ai-deep-research/ai-deep-search.module';

@Module({
  imports: [AiDeepSearchModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}





