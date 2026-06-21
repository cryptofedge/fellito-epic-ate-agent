import { useAppStore } from '@/store/appStore';

// Patterns that suggest PHI presence
const PHI_PATTERNS = [
  // MRN-style: 6-10 digit sequences that aren't obviously reference numbers
  /\bMRN[\s:#]*\d{4,10}\b/i,
  /\bmedical record[\s#:]*\d{4,10}\b/i,
  /\bpatient[\s#:]*(?:id|number|no)[\s#:]*\d{4,10}\b/i,

  // SSN
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\bSSN[\s:#]*\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/i,

  // DOB-style patterns combined with name-like context
  /\bDOB[\s:#]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/i,
  /\bdate of birth[\s:#]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/i,
  /\bborn[\s:]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/i,

  // Full name + DOB combo (high confidence PHI)
  /\b[A-Z][a-z]+,?\s+[A-Z][a-z]+\s+(?:DOB|born|dob)[\s:#]*\d/i,

  // Account number patterns
  /\baccount[\s#:]*\d{6,12}\b/i,
];

// Patterns that are commonly false positives in Go-Live materials
// (e.g., "MRN field", "SSN format", training screenshots with placeholder data)
const FALSE_POSITIVE_INDICATORS = [
  /MRN field/i,
  /MRN column/i,
  /sample MRN/i,
  /example MRN/i,
  /\bXXXXX\b/,
  /\b000-00-0000\b/,
  /\b123-45-6789\b/,
  /\b12345678\b/,
  /\b00000000\b/,
  /placeholder/i,
  /test patient/i,
  /training/i,
];

export interface PhiScanResult {
  hasPotentialPhi: boolean;
  matchedPatterns: string[];
  confidence: 'low' | 'medium' | 'high';
}

export function scanForPhi(text: string): PhiScanResult {
  const matchedPatterns: string[] = [];

  // Check for false positive indicators first
  const looksLikeFalsePositive = FALSE_POSITIVE_INDICATORS.some((p) =>
    p.test(text)
  );

  for (const pattern of PHI_PATTERNS) {
    if (pattern.test(text)) {
      matchedPatterns.push(pattern.source);
    }
  }

  if (matchedPatterns.length === 0) {
    return { hasPotentialPhi: false, matchedPatterns: [], confidence: 'low' };
  }

  // Reduce confidence if false positive indicators are present
  const confidence =
    looksLikeFalsePositive
      ? 'low'
      : matchedPatterns.length >= 2
      ? 'high'
      : 'medium';

  return {
    hasPotentialPhi: confidence !== 'low',
    matchedPatterns,
    confidence,
  };
}

export function logPhiWarningShown(
  context: 'chat' | 'upload',
  userConfirmed: boolean
): void {
  const entry = {
    id: `phi_${Date.now()}`,
    timestamp: Date.now(),
    context,
    warningShown: true as const,
    userConfirmed,
  };
  useAppStore.getState().logPhiAudit(entry);
}
