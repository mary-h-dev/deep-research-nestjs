import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsObject } from 'class-validator'
import { Type } from 'class-transformer'

export class CreateAiDeepSearchDto {
  @ApiPropertyOptional({ description: 'Name of the deep search' })
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional({ description: 'Description of the deep search' })
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional({ description: 'Subject of the deep search' })
  @IsOptional()
  @IsString()
  subject?: string

  @ApiPropertyOptional({ description: 'Final result of the deep search' })
  @IsOptional()
  @IsString()
  finalResult?: string

  @ApiPropertyOptional({ description: 'Raw result of the deep search' })
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  rawResult?: object

  @ApiPropertyOptional({ description: 'Deep search context' })
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  deepSearchContext?: object

  @ApiPropertyOptional({ description: 'Metadata for the deep search' })
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  metadata?: object
}
