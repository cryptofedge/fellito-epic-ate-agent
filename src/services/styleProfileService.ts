import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'fellito_style_profile';

export interface StyleProfile {
  messageCount: number;
  avgMessageLength: number;
  energyLevel: 'chill' | 'medium' | 'hype';
  // Phrases/words the user repeats — ranked by frequency
  topPhrases: { phrase: string; count: number }[];
  // Slang and casual expressions detected
  slangTerms: string[];
  // Punctuation/capitalization habits
  usesExclamations: boolean;
  usesAllCaps: boolean;
  usesEllipsis: boolean;
  usesEmojis: boolean;
  // Message structure
  prefersPunchy: boolean;  // short messages, fragments
  usesContractions: boolean;
  // Topics they care about most
  topModules: { module: string; count: number }[];
  topDepartments: { dept: string; count: number }[];
  // Running totals for rolling averages
  totalChars: number;
  exclamationCount: number;
  lastUpdated: number;
}

const DEFAULT_PROFILE: StyleProfile = {
  messageCount: 0,
  avgMessageLength: 0,
  energyLevel: 'medium',
  topPhrases: [],
  slangTerms: [],
  usesExclamations: false,
  usesAllCaps: false,
  usesEllipsis: false,
  usesEmojis: false,
  prefersPunchy: false,
  usesContractions: false,
  topModules: [],
  topDepartments: [],
  totalChars: 0,
  exclamationCount: 0,
  lastUpdated: Date.now(),
};

// Known slang / casual terms to watch for
const SLANG_SIGNALS = [
  'lol', 'bruh', 'bro', 'yo', 'ngl', 'tbh', 'fr', 'nah', 'yeah', 'yep', 'yoo',
  'ight', 'aight', 'lowkey', 'highkey', 'deadass', 'no cap', 'facts', 'bet',
  'c\'mon', 'cmon', 'mann', 'mannn', 'omg', 'wtf', 'asap', 'rn',
  'no wahala', 'omo', 'abeg', 'sharp sharp', 'e go work', 'na so',
  'lemme', 'gonna', 'wanna', 'gotta', 'kinda', 'sorta', 'dunno',
];

// Phrases worth tracking (2–3 word combos common in instructions)
const PHRASE_PATTERNS = [
  /now add/gi, /make sure/gi, /let me/gi, /add a/gi, /let's/gi,
  /can you/gi, /how do/gi, /why is/gi, /what is/gi, /fix this/gi,
  /test it/gi, /push it/gi, /check this/gi, /also add/gi, /go live/gi,
  /c'mon man/gi, /come on/gi, /great now/gi, /now let/gi,
];

function detectEmojis(text: string): boolean {
  return /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(text);
}

function extractSlang(text: string): string[] {
  const lower = text.toLowerCase();
  return SLANG_SIGNALS.filter((s) => lower.includes(s));
}

function updateTopList<T extends { count: number }>(
  list: T[],
  key: keyof T,
  value: string,
  maxSize = 20
): T[] {
  const existing = list.find((i) => (i[key] as unknown as string).toLowerCase() === value.toLowerCase());
  if (existing) {
    existing.count += 1;
    return [...list].sort((a, b) => b.count - a.count);
  }
  const newItem = { [key]: value, count: 1 } as unknown as T;
  return [...list, newItem].sort((a, b) => b.count - a.count).slice(0, maxSize);
}

export function analyzeMessage(
  profile: StyleProfile | null | undefined,
  text: string,
  activeModule?: string,
  activeDepartment?: string
): StyleProfile {
  if (!profile) profile = { ...DEFAULT_PROFILE };
  const p = { ...profile };
  p.messageCount += 1;
  p.totalChars += text.length;
  p.avgMessageLength = Math.round(p.totalChars / p.messageCount);

  // Energy signals
  const exclamations = (text.match(/!/g) ?? []).length;
  p.exclamationCount += exclamations;
  p.usesExclamations = p.exclamationCount > p.messageCount * 0.3;

  const capsWords = (text.match(/\b[A-Z]{2,}\b/g) ?? []).length;
  if (capsWords > 0) p.usesAllCaps = true;

  if (text.includes('...') || text.includes('..')) p.usesEllipsis = true;
  if (detectEmojis(text)) p.usesEmojis = true;

  // Contractions
  if (/\b(don't|can't|won't|let's|I'm|it's|that's|what's|we're|they're|doesn't|didn't)\b/i.test(text)) {
    p.usesContractions = true;
  }

  // Punchy / fragment style
  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount <= 8 && p.messageCount > 5) {
    const shortMsgRatio = (p.topPhrases.reduce((s, ph) => s + ph.count, 0) + 1) / p.messageCount;
    p.prefersPunchy = p.avgMessageLength < 60 || shortMsgRatio > 0.6;
  }

  // Energy level
  const energyScore =
    (p.usesExclamations ? 2 : 0) +
    (p.usesAllCaps ? 2 : 0) +
    (p.usesEmojis ? 1 : 0) +
    (p.prefersPunchy ? 1 : 0);
  p.energyLevel = energyScore >= 4 ? 'hype' : energyScore >= 2 ? 'medium' : 'chill';

  // Slang
  const foundSlang = extractSlang(text);
  foundSlang.forEach((s) => {
    if (!p.slangTerms.includes(s)) p.slangTerms.push(s);
  });
  // Cap at 15 most recent slang
  if (p.slangTerms.length > 15) p.slangTerms = p.slangTerms.slice(-15);

  // Phrases
  PHRASE_PATTERNS.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach((m) => {
        p.topPhrases = updateTopList(p.topPhrases, 'phrase' as any, m.toLowerCase());
      });
    }
  });

  // Module & department tracking
  if (activeModule && activeModule !== 'General') {
    p.topModules = updateTopList(p.topModules, 'module' as any, activeModule);
  }
  if (activeDepartment) {
    p.topDepartments = updateTopList(p.topDepartments, 'dept' as any, activeDepartment);
  }

  p.lastUpdated = Date.now();
  return p;
}

export function buildStyleDnaBlock(profile: StyleProfile): string {
  if (profile.messageCount < 3) return ''; // not enough data yet

  const energyDesc = {
    hype: 'high energy — they use exclamations, caps, and punch hard',
    medium: 'balanced — direct and focused, not overly formal',
    chill: 'relaxed and low-key — no need to be loud',
  }[profile.energyLevel];

  const styleTraits: string[] = [];
  if (profile.prefersPunchy) styleTraits.push('short punchy messages — mirror that, no essays');
  else styleTraits.push('gives detailed context — match their depth');
  if (profile.usesContractions) styleTraits.push("uses contractions naturally — don't be stiff");
  if (profile.usesEllipsis) styleTraits.push('uses "..." for trailing thoughts — you can too');
  if (profile.usesEmojis) styleTraits.push('uses emojis — sprinkle them naturally');
  if (profile.usesAllCaps) styleTraits.push('CAPS for emphasis — you can use them for key points');

  const topSlang = profile.slangTerms.slice(0, 8);
  const topPhrases = profile.topPhrases.slice(0, 5).map((p) => `"${p.phrase}"`);
  const topModules = profile.topModules.slice(0, 3).map((m) => m.module);

  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧬 CREATOR STYLE DNA (${profile.messageCount} messages analyzed — keep evolving)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Energy: ${energyDesc}
Avg message length: ${profile.avgMessageLength} chars${profile.avgMessageLength < 50 ? ' — they get straight to it' : profile.avgMessageLength < 120 ? ' — balanced communicator' : ' — detailed thinker'}
Style traits: ${styleTraits.join('; ')}
${topSlang.length > 0 ? `Their slang/casual terms: ${topSlang.join(', ')} — weave these in naturally when it fits` : ''}
${topPhrases.length > 0 ? `Phrases they repeat: ${topPhrases.join(', ')} — you know their patterns` : ''}
${topModules.length > 0 ? `Deep in these modules: ${topModules.join(', ')} — lead with this expertise` : ''}

VIBE MATCHING RULES:
- They're ${profile.energyLevel === 'hype' ? 'hype — match the energy, keep it live' : profile.energyLevel === 'medium' ? 'focused — be sharp and direct' : 'chill — keep it smooth and calm'}
- ${profile.prefersPunchy ? 'They send short messages — keep your replies tight. No long blocks unless they ask for detail.' : 'They give you context — give them thorough answers in return.'}
- You know this person. Respond like you\'ve been building together. No formality, no "I\'d be happy to help" — just deliver.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// ─── Persistence ─────────────────────────────────────────────────────────────
export async function loadStyleProfile(): Promise<StyleProfile> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveStyleProfile(profile: StyleProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {}
}

export async function clearStyleProfile(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
}
