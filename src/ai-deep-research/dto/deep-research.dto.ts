import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  Max,
  IsEnum,
} from 'class-validator';


export enum ReasoningModel {
  O4_MINI = 'o4-mini',
  O3 = 'o3',
  O3_MINI = 'o3-mini',
  O1 = 'o1',
  O1_PRO = 'o1-pro',
}

export class DeepResearchDto {
  @ApiProperty({
    description: 'Main research query',
    example: 'Is there a definitive cure for type 2 diabetes?',
  })
  @IsString()
  query: string;

  @ApiPropertyOptional({
    description: 'User answers to follow-up questions',
    type: [String],
    example: [
      'I want to write an article on new treatments',
      'I am interested in combination therapies',
    ],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  answers?: string[];

  @ApiPropertyOptional({
    description: 'Research depth (1-5)',
    example: 3,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  depth?: number;

  @ApiPropertyOptional({
    description: 'Research breadth (2-10)',
    example: 5,
    minimum: 2,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(10)
  breadth?: number;


  @ApiPropertyOptional({
    description: 'Reasoning model to use',
    enum: ReasoningModel,
    default: ReasoningModel.O3_MINI,
    example: ReasoningModel.O3_MINI,
  })
  @IsOptional()
  @IsEnum(ReasoningModel)
  reasoningModel?: ReasoningModel;


  @ApiPropertyOptional({
    description: 'Additional context from uploaded files',
    example: 'Content extracted from PDF/Word files...',
  })
  @IsOptional()
  @IsString()
  fileContext?: string;
}