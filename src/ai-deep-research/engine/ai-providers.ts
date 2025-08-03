import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModelV1 } from 'ai';
import { getEncoding } from 'js-tiktoken';
import { RecursiveCharacterTextSplitter } from './text-splitter';
import { ReasoningModel } from '../dto/deep-research.dto';




export function getModel(
  modelName: ReasoningModel = ReasoningModel.O3_MINI
): LanguageModelV1 {
  const openai = process.env.OPENAI_API_KEY
    ? createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_ENDPOINT,
      })
    : undefined;
  
  if (!openai) {
    throw new Error('No available LLM provider configured');
  }

  try {
    switch (modelName) {
      case ReasoningModel.O4_MINI:
        return openai('o4-mini', {
          reasoningEffort: 'medium',
          structuredOutputs: true,
        });
      
      case ReasoningModel.O3:
        return openai('o3', {
          reasoningEffort: 'medium',
          structuredOutputs: true,
        });
      
      case ReasoningModel.O3_MINI:
        return openai('o3-mini', {
          reasoningEffort: 'medium',
          structuredOutputs: true,
        });
      
      case ReasoningModel.O1:
        return openai('o1', {
          reasoningEffort: 'medium',
          structuredOutputs: true,
        });
      
      case ReasoningModel.O1_PRO:
        return openai('o1-pro', {
          reasoningEffort: 'medium',
          structuredOutputs: true,
        });
      
      default:
        console.warn(`Model ${modelName} not supported, falling back to o3-mini`);
        return openai('o3-mini', {
          reasoningEffort: 'medium',
          structuredOutputs: true,
        });
    }
  } catch (error) {
    console.error(`Error initializing model ${modelName}:`, error);
    
    try {
      return openai('o3-mini', {
        reasoningEffort: 'medium',
        structuredOutputs: true,
      });
    } catch (fallbackError) {
      return openai('o1', {
        reasoningEffort: 'medium',
        structuredOutputs: true,
      });
    }
  }
}


const MinChunkSize = 140;
const encoder = getEncoding('o200k_base');

export function trimPrompt(
  prompt: string,
  contextSize = Number(process.env.CONTEXT_SIZE) || 128_000,
): string {
  if (!prompt) return '';

  const length = encoder.encode(prompt).length;
  if (length <= contextSize) return prompt;

  const overflowTokens = length - contextSize;
  const chunkSize = prompt.length - overflowTokens * 3;
  if (chunkSize < MinChunkSize) return prompt.slice(0, MinChunkSize);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: 0,
  });
  const trimmed = splitter.splitText(prompt)[0] ?? '';

  if (trimmed.length === prompt.length) {
    return trimPrompt(prompt.slice(0, chunkSize), contextSize);
  }
  return trimPrompt(trimmed, contextSize);
}