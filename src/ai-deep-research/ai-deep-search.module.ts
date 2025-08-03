import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { AiDeepSearchController } from './ai-deep-search.controller'
import { AiDeepResearchService } from './ai-deep-search.service'
import { PrismaModule } from 'src/prisma/prisma.module'
import { StorageModule } from 'src/services/core/storage/storage.module'

@Module({
  imports: [HttpModule, PrismaModule, StorageModule],
  controllers: [AiDeepSearchController],
  providers: [AiDeepResearchService],
  exports: [AiDeepResearchService],
})
export class AiDeepSearchModule {}
