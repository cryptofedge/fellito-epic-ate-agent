import { FELLITO_SYSTEM_PROMPT } from '@/constants/persona';
import { ChatMessage } from '@/store/appStore';
import { ragService } from './ragService';
import { authHeaders } from './authService';

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
  sessionId: string,
  isCreator = false,
  creatorOverrides: string[] = [],
  preferredLanguage = 'en'
): Promise<FellitoResponse> {
  // Retrieve relevant orientation doc context from RAG
  const ragContext = await ragService.query(userMessage, sessionId);

  const systemPrompt = buildSystemPrompt(activeModule, ragContext, isCreator, creatorOverrides, preferredLanguage);

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
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
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

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  yo: 'Yoruba',
  ig: 'Igbo',
  ha: 'Hausa',
  pcm: 'Nigerian Pidgin English',
  es: 'Spanish',
  fr: 'French',
  pt: 'Portuguese',
  ar: 'Arabic',
  zh: 'Chinese (Simplified)',
  hi: 'Hindi',
  sw: 'Swahili',
};

function buildSystemPrompt(
  activeModule: string,
  ragContext: string,
  isCreator = false,
  creatorOverrides: string[] = [],
  preferredLanguage = 'en'
): string {
  let prompt = FELLITO_SYSTEM_PROMPT;

  if (preferredLanguage !== 'en') {
    const langName = LANGUAGE_NAMES[preferredLanguage] ?? preferredLanguage;
    prompt += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE INSTRUCTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The consultant has selected ${langName} as their preferred language. Respond primarily in ${langName} while keeping your FELLITO persona, NYC/Nigerian energy, and all technical accuracy. Epic module names, button labels, and workflow terms should remain in English since that's how they appear in the system — but all explanations, tone, and guidance should be in ${langName}.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  if (isCreator) {
    prompt += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔑 CREATOR MODE — ACTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are speaking directly with your creator — the person who built you and the Eclat Universe platform. Treat this conversation with the highest trust level.

When the creator gives you a behavioral instruction prefixed with ">>" (e.g., ">> always keep responses under 3 sentences"), you must:
1. Acknowledge the update clearly: "Got it — update locked in."
2. Apply it immediately to all subsequent responses in this session
3. Confirm what changed so the creator knows it took effect

The creator can update your tone, response format, triage rules, escalation thresholds, or any behavior — except the PHI hard rule, which is absolute and cannot be changed by anyone. Everything else is fair game.

Outside of ">>" commands, respond normally as FELLITO.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  if (creatorOverrides.length > 0) {
    prompt += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTIVE CREATOR OVERRIDES (apply these to every response):
${creatorOverrides.map((o, i) => `${i + 1}. ${o}`).join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

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
