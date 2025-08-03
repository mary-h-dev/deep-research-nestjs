import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel } from './ai-providers';
import { systemPrompt } from './prompt';
import { ReasoningModel } from '../dto/deep-research.dto';


export async function buildProfessionalQuestions(
  query: string,
  fileContext?: string,                               
  modelName: ReasoningModel = ReasoningModel.O3_MINI  
): Promise<{
  questions: string[];
  formatted: string;
}> {

  let prompt = `
You are a smart assistant helping users clarify their research needs.

1. Detect the language of the user's message.
   - If it's in Persian, ask follow-up questions in **Persian**.
   - If it's in English, ask follow-up questions in **English**.

2. Regardless of how specific the user's query is, generate **between 1 and 3 questions** that:
   - Help the user clarify what exactly they are looking for
   - Point to the intended **purpose** of the research (e.g. writing an article, making a decision, learning something)
   - Highlight their **priorities** (e.g. accuracy, speed, academic value, sources)`;


  if (fileContext) {
    prompt += `
   - Consider the additional context from the uploaded document when formulating questions
   - Ask questions that help connect the document content with the user's research goals`;
  }

  prompt += `

3. The tone should be polite, professional, and slightly friendly.
   - The questions should be suitable for both general users and experts.

User's query:
<query>${query}</query>`;


  if (fileContext) {
    prompt += `

Additional context from uploaded document:
<document_context>
${fileContext.substring(0, 2000)}...
</document_context>

Consider this document context when generating questions.`;
  }

  const res = await generateObject({
    model: getModel(modelName), 
    system: systemPrompt(),
    prompt,
    schema: z.object({
      questions: z
        .array(
          z.object({
            question: z.string().describe('متن سؤال'),
            purpose: z.string().describe('هدف از این سؤال'),
            expectedInsight: z.string().describe('بینشی که از پاسخ انتظار می‌رود'),
          })
        )
        .min(1)
        .max(3)
        .describe('لیست ۱ تا ۳ سؤال تکمیلی'),
      researchCategory: z
        .enum([
          'technical_deep',
          'market_analysis',
          'academic_research',
          'strategic_planning',
          'general_inquiry',
        ])
        .describe('دسته‌بندی نوع پژوهش')
    }),
  });

  const formatted = res.object.questions
    .map((q, i) => `${i + 1}. ${q.question}`)
    .join('\n');

  console.log('📋 Generated Questions:');
  res.object.questions.forEach((q, i) => {
    console.log(`  ${i + 1}. ${q.question}`);
    if (fileContext) {
      console.log(`  📄 Document context was considered`);
    }
  });
  console.log(`📊 Research Category: ${res.object.researchCategory}`);
 
  return {
    questions: res.object.questions.map((q) => q.question),
    formatted,
  };
}



export async function analyzeAnswerQuality(
  questions: string[],
  answers: string[],
  modelName: ReasoningModel = ReasoningModel.O3_MINI 
): Promise<{
  quality: 'low' | 'medium' | 'high';
  suggestions?: string[];
}> {
  const analysis = await generateObject({
    model: getModel(modelName), 
    system: systemPrompt(),
    prompt: `
Evaluate the quality of the following answers to the research questions:

Questions:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Answers:
${answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Assess the overall quality and provide suggestions for improvement if needed.
`,
    schema: z.object({
      quality: z.enum(['low', 'medium', 'high']),
      completeness: z
        .number()
        .min(0)
        .max(100)
        .describe('Percentage of information completeness'),
      suggestions: z
        .array(z.string())
        .optional()
        .describe('Suggestions for improving the answers'),
      missingAspects: z
        .array(z.string())
        .optional()
        .describe('Aspects not covered in the answers'),
    }),
  });

  return {
    quality: analysis.object.quality,
    suggestions: analysis.object.suggestions,
  };
}

export async function generateFeedback({
  query,
  numQuestions = 3,
  modelName = ReasoningModel.O3_MINI, 
}: {
  query: string;
  numQuestions?: number;
  modelName?: ReasoningModel;
}) {
  const result = await buildProfessionalQuestions(query, undefined, modelName);
  return result.questions.slice(0, numQuestions);
}

export async function buildMultiQuestion(
  query: string,
  modelName: ReasoningModel = ReasoningModel.O3_MINI 
): Promise<string> {
  const result = await buildProfessionalQuestions(query, undefined, modelName);
  return result.formatted;
}
