import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
  HttpException,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import { AiDeepResearchService } from './ai-deep-search.service';
import { CreateAiDeepSearchDto } from './dto/create-ai-deep-search.dto';
import { UpdateAiDeepSearchDto } from './dto/update-ai-deep-search.dto';
import { DeepResearchDto } from './dto/deep-research.dto';





@ApiTags('AI Deep Search')
@ApiExtraModels(DeepResearchDto, CreateAiDeepSearchDto, UpdateAiDeepSearchDto)
@Controller('ai-deep-search')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AiDeepSearchController {
  constructor(private readonly aiDeepResearchService: AiDeepResearchService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create or continue a deep research session' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        deepResearch: { $ref: '#/components/schemas/DeepResearchDto' },
        meta: { $ref: '#/components/schemas/CreateAiDeepSearchDto' },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Optional PDF or Word document for additional context',
        },
      },
      required: ['deepResearch'],  
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Questions generated or research completed',
  })
  async create(
    @Body('deepResearch') deepResearch: DeepResearchDto,
    @Req() req: any,
    @Body('meta') meta?: CreateAiDeepSearchDto,        
    @UploadedFile() file?: Express.Multer.File,
  ) {
    try {
      const userId = req.user?.id;
      const createDto: CreateAiDeepSearchDto = meta || {};
      return await this.aiDeepResearchService.createDeepResearch(
        deepResearch,
        createDto,
        userId,
        req,
        file,
      );
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: error.message || 'Internal error in deep search',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }


  @Get()
  @ApiOperation({ summary: 'Get all deep searches for the current user' })
  async findAll(
    @Req() req: any,
    @Query('page') page: string,
    @Query('perPage') perPage: string,
  ) {
    const userId = req.user?.id;
    const paginateOptions = { page, perPage };
    return this.aiDeepResearchService.findAll(userId, paginateOptions);
  }



  @Get(':id')
  @ApiOperation({ summary: 'Get a single deep search by ID' })
  async findOne(@Param('id') id: string) {
    return this.aiDeepResearchService.findOne(+id);
  }



  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing deep search record' })
  @ApiBody({ type: UpdateAiDeepSearchDto })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateAiDeepSearchDto,
  ) {
    return this.aiDeepResearchService.update(+id, updateDto);
  }



  @Delete(':id')
  @ApiOperation({ summary: 'Delete a deep search record by ID' })
  async remove(@Param('id') id: string) {
    return this.aiDeepResearchService.remove(+id);
  }
}
