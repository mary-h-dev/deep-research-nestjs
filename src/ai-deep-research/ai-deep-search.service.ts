import { Injectable, BadRequestException } from '@nestjs/common'
import { DeepResearchDto, ReasoningModel } from './dto/deep-research.dto'           // ← CHANGED: اضافه کردن ReasoningModel
import { CreateAiDeepSearchDto } from './dto/create-ai-deep-search.dto'
import { UpdateAiDeepSearchDto } from './dto/update-ai-deep-search.dto'
import { PrismaService, PaginateOptions } from 'src/prisma/prisma.service'
import { StorageService } from 'src/services/core/storage/storage.service'
import { FileEntityType } from '@prisma/client'
import { Request } from 'express'
import { HandleException } from 'helpers/handle.exception'
import { buildProfessionalQuestions } from './engine/feedback'
import { deepResearch, writeFinalAnswer, writeFinalReport } from './engine/deep-research-engine'
import { generateObject } from 'ai'
import { getModel } from './engine/ai-providers'
import { systemPrompt } from './engine/prompt'
import { z } from 'zod'
import * as pdfParse from 'pdf-parse'
import * as mammoth from 'mammoth'



@Injectable()
export class AiDeepResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async findAll(userId: string, paginateOptions: PaginateOptions) {
    return PrismaService.paginate(this.prisma.aiDeepSearch, paginateOptions, {
      where: { userId },
      orderBy: { createdAt: 'desc' },
    } as any)
  }

  async findOne(id: number) {
    return this.prisma.aiDeepSearch.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new HandleException('core.404', 404)
    })
  }

  async update(id: number, updateDto: UpdateAiDeepSearchDto) {
    await this.prisma.aiDeepSearch.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new HandleException('core.404', 404)
    })

    await this.prisma.aiDeepSearch.update({
      where: { id },
      data: { ...updateDto },
    })

    return this.prisma.aiDeepSearch.findUniqueOrThrow({ where: { id } })
  }

  async remove(id: number) {
    await this.prisma.aiDeepSearch.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new HandleException('core.404', 404)
    })

    return this.prisma.aiDeepSearch.delete({ where: { id } })
  }

  private async processFileContent(file: Express.Multer.File): Promise<string | undefined> {
    if (!file) return undefined

    try {
      const mimeType = file.mimetype.toLowerCase()
      let content = ''

      if (mimeType === 'application/pdf') {
        const data = await pdfParse(file.buffer)
        content = data.text
      } else if (
        mimeType ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
      ) {
        const result = await mammoth.extractRawText({ buffer: file.buffer })
        content = result.value
      } else {
        console.warn('Unsupported file type:', mimeType)
        return undefined
      }

      return content
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim()
        .substring(0, 10000) 
    } catch (error) {
      console.error('Error processing file:', error)
      return undefined
    }
  }

  async createDeepResearch(
    dto: DeepResearchDto,
    createDto: CreateAiDeepSearchDto,
    userId: string,
    req: Request,
    uploadedFile?: Express.Multer.File,     
  ) {
    console.log('▶️ createDeepResearch START', { query: dto.query, userId, hasFile: !!uploadedFile });
    const {
      query,
      answers,
      depth,
      breadth,
      reasoningModel = ReasoningModel.O3_MINI, 
    } = dto

    let enhancedQuery = query
    let fileContext: string | undefined
    if (uploadedFile) {
      console.log('📄 processing uploadedFile', uploadedFile.originalname);
      fileContext = await this.processFileContent(uploadedFile)
      console.log('📄 extracted fileContext length:', fileContext?.length);
      if (fileContext) {
        enhancedQuery = `${query}\n\nContext from uploaded document:\n${fileContext.substring(
          0,
          3000,
        )}...`
      }
    }
    console.log('🔍 Enhanced Query:', enhancedQuery);

    if (!answers || answers.length === 0) {
      console.log('❓ No answers provided, building follow-up questions');
      const { questions, formatted } = await buildProfessionalQuestions(
        enhancedQuery,
        fileContext,
        reasoningModel,
      )
      return {
        status: 'questions_generated',
        questions,
        formatted,
        nextStep: 'Please answer these questions to continue the research',
      }
    }

    const params = await this.estimateParameters(
      enhancedQuery,
      answers,
      reasoningModel,
    )
    const finalDepth = depth ?? params.depth
    const finalBreadth = breadth ?? params.breadth

    const combinedPrompt = this.buildCombinedPrompt(
      enhancedQuery,
      answers,
      finalDepth,
      finalBreadth,
    )

    console.log('🚀 Running deepResearch…');
    const progressLog: string[] = []
    let deepResult
    try {                                                              
      deepResult = await deepResearch({
        query: combinedPrompt,
        breadth: finalBreadth,
        depth: finalDepth,
        onProgress: (progress) => {
          const logEntry =
            `Progress: D${progress.currentDepth}/${progress.totalDepth} ` +
            `B${progress.currentBreadth}/${progress.totalBreadth} ` +
            `[${progress.completedQueries}/${progress.totalQueries}] ` +
            `"${progress.currentQuery}"`
          progressLog.push(logEntry)
        },
        modelName: reasoningModel,
        fileContext,
      })
    } catch (e) {                                                          
      console.warn('deepResearch failed with model', reasoningModel, e)
      deepResult = await deepResearch({
        query: combinedPrompt,
        breadth: finalBreadth,
        depth: finalDepth,
        onProgress: (progress) => {
          const logEntry =
            `Progress: D${progress.currentDepth}/${progress.totalDepth} ` +
            `B${progress.currentBreadth}/${progress.totalBreadth} ` +
            `[${progress.completedQueries}/${progress.totalQueries}] ` +
            `"${progress.currentQuery}"`
          progressLog.push(logEntry)
        },
        modelName: ReasoningModel.O3_MINI,
        fileContext,
      })
    }
    const { learnings, visitedUrls } = deepResult

    let report: string
    try {                                                                
      report = await writeFinalReport({
        prompt: combinedPrompt,
        learnings,
        visitedUrls,
        modelName: reasoningModel,
      })
    } catch {
      report = await writeFinalReport({
        prompt: combinedPrompt,
        learnings,
        visitedUrls,
        modelName: ReasoningModel.O3_MINI,
      })
    }

    let answer: string
    try {                                                                    
      answer = await writeFinalAnswer({
        prompt: combinedPrompt,
        learnings,
        modelName: reasoningModel,
      })
    } catch {
      answer = await writeFinalAnswer({
        prompt: combinedPrompt,
        learnings,
        modelName: ReasoningModel.O3_MINI,
      })
    }

    const visitedUrlsUrl = await this.saveArrayToStorage(
      visitedUrls,
      `deep-research-visited-urls-${Date.now()}.json`,
      FileEntityType.AI_DEEP_SEARCH,
      userId,
      req,
    )
    const learningsUrl = await this.saveObjectArrayToStorage(
      learnings.map((l) => ({ learning: l.learning, sources: l.sources })),
      `deep-research-learnings-${Date.now()}.json`,
      FileEntityType.AI_DEEP_SEARCH,
      userId,
      req,
    )
    const logsUrl = await this.saveTextToStorage(
      progressLog.join('\n'),
      `deep-research-logs-${Date.now()}.txt`,
      FileEntityType.AI_DEEP_SEARCH,
      userId,
      req,
    )
    const reportUrl = await this.saveReportToStorage(report, userId, req)

    const created = await this.prisma.aiDeepSearch.create({
      data: {
        userId,
        name: createDto.name,
        description: createDto.description,
        subject: createDto.subject ?? query,
        finalResult: answer,
        rawResult: {
          reasoning: params.reasoning,
          visitedUrlsCount: visitedUrls.length,
          reasoningModel,
        },
        deepSearchContext: {
          query,
          enhancedQuery,
          answers,
          depth: finalDepth,
          breadth: finalBreadth,
          hasFileContext: !!fileContext,
        },
        metadata: {
          visitedUrlsFile: visitedUrlsUrl,
          learningsFile: learningsUrl,
          logsFile: logsUrl,
          reportFile: reportUrl,
          fileContextSummary: fileContext,
        },
      },
    })

    return {
      status: 'research_completed',
      id: created.id,
      answer,
      urls: {
        visitedUrls: visitedUrlsUrl,
        learnings: learningsUrl,
        logs: logsUrl,
        report: reportUrl,
      },
      parameters: {
        depth: finalDepth,
        breadth: finalBreadth,
        reasoning: params.reasoning,
        model: reasoningModel,
      },
    }
  }

  private async estimateParameters(
    query: string,
    answers: string[],
    modelName: ReasoningModel = ReasoningModel.O3_MINI,
  ) {
    const estimation = await generateObject({
      model: getModel(modelName),
      system: systemPrompt(),
      prompt: `
Based on the following user question and answers, estimate suitable values for "depth" and "breadth".
Main Question: ${query}
User Answers:
${answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Guidelines:
- depth (1-5): How deep to explore each topic
- breadth (2-10): How many different angles to explore
      `,
      schema: z.object({
        depth: z.number().min(1).max(5),
        breadth: z.number().min(2).max(10),
        reasoning: z.string(),
        complexity: z.enum(['low', 'medium', 'high', 'very_high']),
        researchScope: z.array(z.string()),
      }),
    })
    return estimation.object
  }

  private buildCombinedPrompt(
    query: string,
    answers: string[],
    depth: number,
    breadth: number,
  ): string {
    return `
Main Question: ${query}

User's Detailed Answers:
${answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Research Parameters: depth=${depth}, breadth=${breadth}
`
  }


  private async saveArrayToStorage(
    arr: string[],
    fileName: string,
    entityType: FileEntityType,
    userId?: string,
    req?: Request,
  ): Promise<string> {
    const jsonStr = JSON.stringify(arr, null, 2)
    const buffer = Buffer.from(jsonStr, 'utf-8')

    const multerFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: fileName,
      encoding: '7bit',
      mimetype: 'application/json',
      buffer,
      size: buffer.length,
      destination: '',
      filename: '',
      path: '',
      stream: null,
    }

    const args = {
      file: multerFile,
      uploadedByUserId: userId || 'system',
      entityType,
      folderName: `deep-research/${userId || 'system'}`,
      entityId: userId || 'system',
    }

    const uploaded = await this.storageService.uploadFile(args)
    return uploaded.url
  }

  private async saveObjectArrayToStorage(
    arr: any[],
    fileName: string,
    entityType: FileEntityType,
    userId?: string,
    req?: Request,
  ): Promise<string> {
    const jsonStr = JSON.stringify(arr, null, 2)
    const buffer = Buffer.from(jsonStr, 'utf-8')

    const multerFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: fileName,
      encoding: '7bit',
      mimetype: 'application/json',
      buffer,
      size: buffer.length,
      destination: '',
      filename: '',
      path: '',
      stream: null,
    }

    const args = {
      file: multerFile,
      uploadedByUserId: userId || 'system',
      entityType,
      folderName: `deep-research/${userId || 'system'}`,
      entityId: userId || 'system',
    }

    const uploaded = await this.storageService.uploadFile(args)
    return uploaded.url
  }

  private async saveTextToStorage(
    text: string,
    fileName: string,
    entityType: FileEntityType,
    userId?: string,
    req?: Request,
  ): Promise<string> {
    const buffer = Buffer.from(text, 'utf-8')

    const multerFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: fileName,
      encoding: '7bit',
      mimetype: 'text/plain',
      buffer,
      size: buffer.length,
      destination: '',
      filename: '',
      path: '',
      stream: null,
    }

    const args = {
      file: multerFile,
      uploadedByUserId: userId || 'system',
      entityType,
      folderName: `deep-research/${userId || 'system'}`,
      entityId: userId || 'system',
    }

    const uploaded = await this.storageService.uploadFile(args)
    return uploaded.url
  }

  private async saveReportToStorage(
    report: string,
    userId?: string,
    req?: Request,
  ): Promise<string> {
    if (!report) {
      throw new BadRequestException('Report content is empty')
    }

    const reportBuffer = Buffer.from(report, 'utf-8')
    const fileName = `deep-research-report-${Date.now()}.md`

    const multerFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: fileName,
      encoding: '7bit',
      mimetype: 'text/markdown',
      buffer: reportBuffer,
      size: reportBuffer.length,
      destination: '',
      filename: '',
      path: '',
      stream: null,
    }

    const args = {
      file: multerFile,
      uploadedByUserId: userId || 'system',
      entityType: FileEntityType.AI_DEEP_SEARCH,
      folderName: `deep-research/${userId || 'system'}`,
      entityId: userId || 'system',
    }

    const uploadedFile = await this.storageService.uploadFile(args)
    return uploadedFile.url
  }
}
