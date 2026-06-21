import Anthropic from '@anthropic-ai/sdk';
import { FELLITO_SYSTEM_PROMPT } from '@/constants/persona';
import { ChatMessage } from '@/store/appStore';
import { ragService } from './ragService';

const MODEL = 'claude-sonnet-4-6';

// Backend proxy URL — API key never lives in the mobile bundle
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';

export interface FellitoResponse {
  text: string;
  module?: string;
}

export async function askFellito(
  userMessage: string,
  history: ChatMessage[],
  activeModule: string,
  sessionId: string
): Promise<FellitoResponse> {
  // Retrieve relevant orientation doc context from RAG
  const ragContext = await ragService.query(userMessage, sessionId);

  const systemPrompt = buildSystemPrompt(activeModule, ragContext);

  // Map history to Anthropic message format
  const messages: Anthropic.MessageParam[] = history
    .slice(-20) // last 20 messages for context window efficiency
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

  messages.push({ role: 'user', content: userMessage });

  const response = await fetch(`${BACKEND_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      system: systemPrompt,
      messages,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Fellito API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text ?? '';

  return { text, module: activeModule };
}

function buildSystemPrompt(activeModule: string, ragContext: string): string {
  let prompt = FELLITO_SYSTEM_PROMPT;

  if (activeModule && activeModule !== 'General') {
    prompt += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT CONTEXT: Consultant is asking about the ${activeModule} module. Prioritize ${activeModule}-specific knowledge in your response.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  if (ragContext) {
    prompt += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLIENT ORIENTATION DOCS (prioritize this over general Epic knowledge):
${ragContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  return prompt;
}
