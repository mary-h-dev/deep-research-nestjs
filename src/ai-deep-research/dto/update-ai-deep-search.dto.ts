import { PartialType } from '@nestjs/swagger';
import { CreateAiDeepSearchDto } from './create-ai-deep-search.dto';

export class UpdateAiDeepSearchDto extends PartialType(CreateAiDeepSearchDto) {}