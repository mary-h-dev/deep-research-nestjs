import FirecrawlApp, { SearchResponse } from '@mendable/firecrawl'
import { generateObject } from 'ai'
import { z } from 'zod'
import { getModel, trimPrompt } from './ai-providers'
import { systemPrompt } from './prompt'
const { compact } = require('lodash')
const pLimit = require('p-limit')
import { ReasoningModel } from '../dto/deep-research.dto'


export type ResearchProgress = {
  currentDepth: number
  totalDepth: number
  currentBreadth: number
  totalBreadth: number
  currentQuery?: string
  totalQueries: number
  completedQueries: number
}

export type LearningWithSources = {
  learning: string
  sources: string[]
}

export type ResearchResult = {
  learnings: LearningWithSources[]
  visitedUrls: string[]
}

const ConcurrencyLimit = Number(process.env.FIRECRAWL_CONCURRENCY) || 2

const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_KEY ?? '',
  apiUrl: process.env.FIRECRAWL_BASE_URL,
})

const log = (...args: any[]) => console.log(...args)

export function mergeLearnings(a: LearningWithSources[], b: LearningWithSources[]): LearningWithSources[] {
  const map = new Map<string, Set<string>>()
  const add = (l: LearningWithSources) => {
    const k = l.learning.trim()
    const set = map.get(k) ?? new Set<string>()
    l.sources.forEach((s) => set.add(s))
    map.set(k, set)
  }
  ;[...a, ...b].forEach(add)
  return Array.from(map.entries()).map(([learning, s]) => ({
    learning,
    sources: [...s],
  }))
}

export function learningListToMarkdown(learnings: LearningWithSources[]): string {
  return learnings
    .map(
      (l) => `- ${l.learning}  \n  **Sources:** ${l.sources
        .map((u) => `[${new URL(u).hostname}](${u})`)
        .join(', ')}`
    )
    .join('\n')
}


async function generateSerpQueries({
  query,
  numQueries = 3,
  learnings,
  modelName = ReasoningModel.O3_MINI, 
}: {
  query: string
  numQueries?: number
  learnings?: LearningWithSources[]
  modelName?: ReasoningModel      
}): Promise<{ query: string; researchGoal: string }[]> {
  const res = await generateObject({
    model: getModel(modelName),    
    system: systemPrompt(),
    prompt: `Generate up to ${numQueries} distinct SERP queries for: <prompt>${query}</prompt>${
      learnings?.length
        ? `\nExisting facts:\n${learnings.map((l) => l.learning).join('\n')}`
        : ''
    }`,
    schema: z.object({
      queries: z
        .array(z.object({ query: z.string(), researchGoal: z.string() }))
        .max(numQueries),
    }),
  })
  return res.object.queries as { query: string; researchGoal: string }[]
}


async function processSerpResultWithSources({
  query,
  result,
  numLearnings = 3,
  numFollowUpQuestions = 3,
  modelName = ReasoningModel.O3_MINI, 
}: {
  query: string
  result: SearchResponse
  numLearnings?: number
  numFollowUpQuestions?: number
  modelName?: ReasoningModel      
}): Promise<{ learnings: LearningWithSources[]; followUpQuestions: string[] }> {
  const items = compact(result.data)
  const contents = items.map(
    (it, i) => `<content id="${i}" url="${it.url}">\n${trimPrompt(
      it.markdown ?? '',
      25_000
    )}\n</content>`
  )

  const aiRes = await generateObject({
    model: getModel(modelName),       
    abortSignal: AbortSignal.timeout(60_000),
    system: systemPrompt(),
    prompt: trimPrompt(
      `Analyse SERP results for <query>${query}</query>. Provide up to ${numLearnings} unique facts with id(s) of sources used.\n\n<contents>\n${contents.join(
        '\n'
      )}\n</contents>`
    ),
    schema: z.object({
      learnings: z
        .array(z.object({ learning: z.string(), sources: z.array(z.number()) }))
        .max(numLearnings),
      followUpQuestions: z.array(z.string()).max(numFollowUpQuestions),
    }),
  })

  const learnings: LearningWithSources[] = aiRes.object.learnings.map((l) => ({
    learning: l.learning.trim(),
    sources: l.sources
      .map((id) => items[id]?.url)
      .filter(Boolean) as string[],
  }))

  return { learnings, followUpQuestions: aiRes.object.followUpQuestions }
}


export async function deepResearch({
  query,
  breadth,
  depth,
  learnings = [],
  visitedUrls = [],
  onProgress,
  modelName = ReasoningModel.O3_MINI, 
  fileContext,                      
}: {
  query: string
  breadth: number
  depth: number
  learnings?: LearningWithSources[]
  visitedUrls?: string[]
  onProgress?: (p: ResearchProgress) => void
  modelName?: ReasoningModel         
  fileContext?: string           
}): Promise<ResearchResult> {
  const progress: ResearchProgress = {
    currentDepth: depth,
    totalDepth: depth,
    currentBreadth: breadth,
    totalBreadth: breadth,
    totalQueries: 0,
    completedQueries: 0,
  }
  const report = (u: Partial<ResearchProgress>) => {
    Object.assign(progress, u)
    onProgress?.(progress)
  }


  const enhancedQuery = fileContext
    ? `${query}\n\nAdditional context from uploaded file:\n${fileContext.substring(
        0,
        5000
      )}...`
    : query

  const serpQueries = await generateSerpQueries({
    query: enhancedQuery,            
    numQueries: breadth,
    learnings,
    modelName,                   
  })

  report({
    totalQueries: serpQueries.length,
    currentQuery: serpQueries[0]?.query,
  })

  const limit = pLimit(ConcurrencyLimit)
  const results = await Promise.all(
    serpQueries.map((sq) =>
      limit(async () => {
        try {
          const result = await firecrawl.search(sq.query, {
            timeout: 15_000,
            limit: 5,
            scrapeOptions: { formats: ['markdown'] },
          })
          const newUrls = compact(result.data.map((r) => r.url))
          const newBreadth = Math.ceil(breadth / 2)
          const newDepth = depth - 1

          const { learnings: fresh, followUpQuestions } =
            await processSerpResultWithSources({
              query: sq.query,
              result,
              numLearnings: newBreadth,
              numFollowUpQuestions: newBreadth,
              modelName,               // ← CHANGED
            })

          let merged = mergeLearnings(learnings, fresh)
          const urls = [...new Set([...visitedUrls, ...newUrls])]

          if (newDepth > 0) {
            report({
              currentDepth: newDepth,
              currentBreadth: newBreadth,
              completedQueries: progress.completedQueries + 1,
            })
            const nextQuery = `Previous research goal: ${sq.researchGoal}\nFollow-up research directions:\n${followUpQuestions.join(
              '\n'
            )}`
            const deeper = await deepResearch({
              query: nextQuery,
              breadth: newBreadth,
              depth: newDepth,
              learnings: merged,
              visitedUrls: urls,
              onProgress,
              modelName,            
              fileContext,        
            })
            merged = mergeLearnings(merged, deeper.learnings)
            return { learnings: merged, visitedUrls: deeper.visitedUrls }
          }

          report({
            currentDepth: 0,
            completedQueries: progress.completedQueries + 1,
          })
          return { learnings: merged, visitedUrls: urls }
        } catch (e) {
          log('Error/timeout for query', sq.query, e)
          return { learnings: [], visitedUrls: [] }
        }
      })
    )
  )

  const flatLearnings = results.reduce<LearningWithSources[]>(
    (acc, r) => mergeLearnings(acc, r.learnings),
    []
  )
  const flatUrls = [...new Set(results.flatMap((r) => r.visitedUrls))]
  return { learnings: flatLearnings, visitedUrls: flatUrls }
}


export async function writeFinalReport({
  prompt,
  learnings,
  visitedUrls,
  modelName = ReasoningModel.O3_MINI, 
}: {
  prompt: string
  learnings: LearningWithSources[]
  visitedUrls: string[]
  modelName?: ReasoningModel        
}): Promise<string> {
  const learningsMd = learningListToMarkdown(learnings)

  const enhancedPrompt = `
Write a comprehensive and well-structured research report based on the provided prompt and facts.

<prompt>${prompt}</prompt>

<facts>
${learningsMd}
</facts>

Instructions:
1. The report must be at least **800 words** (approximately one full A4 page).
2. Use a **clear and engaging tone**: simple language, but with scientific accuracy.
3. **Cite every fact** using the format: **Sources:** [domain](url).
4. Do **not invent** new information or numbers — use only the given facts.
5. Use a professional but friendly style.
6. Structure the report as follows:
   - **Introduction** (~100 words): provide a compelling overview.
   - **Main Body Sections** with clear and descriptive headings.
   - **Conclusion** (~150 words): summarize insights and offer practical takeaways.
7. Use **short, readable paragraphs** and **bold** key insights or important terms.
8. Avoid page numbers or formal headers — this is for digital reading.

The reader should **learn** from the report and **enjoy reading it** at the same time.
`

  const ai = await generateObject({
    model: getModel(modelName),      // ← CHANGED
    system: systemPrompt(),
    prompt: trimPrompt(enhancedPrompt),
    schema: z.object({ reportMarkdown: z.string() }),
  })

  return [
    ai.object.reportMarkdown.trim(),
    '',
    '---',
    '## Raw Source URLs',
    '',
    visitedUrls.map((u) => `- ${u}`).join('\n'),
  ].join('\n')
}


export async function writeFinalAnswer({
  prompt,
  learnings,
  modelName = ReasoningModel.O3_MINI, 
}: {
  prompt: string
  learnings: LearningWithSources[]
  modelName?: ReasoningModel         
}): Promise<string> {
  const urls = [...new Set(learnings.flatMap((l) => l.sources))]
  const res = await generateObject({
    model: getModel(modelName),      
    system: systemPrompt(),
    prompt: trimPrompt(
      `Answer briefly using ONLY the facts below.\n<prompt>${prompt}</prompt>\n<facts>\n${learningListToMarkdown(
        learnings
      )}\n</facts>`
    ),
    schema: z.object({ exactAnswer: z.string() }),
  })
  return `${res.object.exactAnswer.trim()}\n\n**Sources:** ${urls
    .map((u) => `[${new URL(u).hostname}](${u})`)
    .join(', ')}`
}
