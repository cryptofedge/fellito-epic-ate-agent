import { create } from 'zustand';

export interface ConsultantProfile {
  name: string;
  role: string;
  assignedModules: string[];
  goLiveEventName: string;
  goLiveStartDate: string;
  goLiveEndDate: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  module?: string;
  audioUrl?: string;
}

export interface GoLiveSession {
  id: string;
  eventName: string;
  startedAt: number;
  endedAt?: number;
  messages: ChatMessage[];
  orientationDocIds: string[];
}

export interface OrientationDoc {
  id: string;
  filename: string;
  uploadedAt: number;
  moduleTag?: string;
  chunkCount: number;
  phiWarningShown: boolean;
  phiWarningConfirmed: boolean;
}

export interface EscalationRecord {
  id: string;
  tier: 2 | 3 | 4;
  issueSummary: string;
  module: string;
  createdAt: number;
  sentAt?: number;
}

export interface PhiAuditEntry {
  id: string;
  timestamp: number;
  context: 'chat' | 'upload';
  warningShown: true;
  userConfirmed: boolean;
}

interface AppState {
  consultantProfile: ConsultantProfile | null;
  isGoLiveActive: boolean;
  activeSession: GoLiveSession | null;
  pastSessions: GoLiveSession[];
  orientationDocs: OrientationDoc[];
  phiAuditLog: PhiAuditEntry[];
  activeModule: string;
  isVoiceMode: boolean;
  isFellitoSpeaking: boolean;

  setConsultantProfile: (profile: ConsultantProfile) => void;
  startGoLive: () => void;
  endGoLive: () => void;
  addMessage: (msg: ChatMessage) => void;
  setActiveModule: (mod: string) => void;
  addOrientationDoc: (doc: OrientationDoc) => void;
  logPhiAudit: (entry: PhiAuditEntry) => void;
  setVoiceMode: (on: boolean) => void;
  setFellitoSpeaking: (speaking: boolean) => void;
  clearProfile: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  consultantProfile: null,
  isGoLiveActive: false,
  activeSession: null,
  pastSessions: [],
  orientationDocs: [],
  phiAuditLog: [],
  activeModule: 'General',
  isVoiceMode: false,
  isFellitoSpeaking: false,

  setConsultantProfile: (profile) => set({ consultantProfile: profile }),

  startGoLive: () => {
    const profile = get().consultantProfile;
    const session: GoLiveSession = {
      id: `session_${Date.now()}`,
      eventName: profile?.goLiveEventName ?? 'Go-Live',
      startedAt: Date.now(),
      messages: [],
      orientationDocIds: get().orientationDocs.map((d) => d.id),
    };
    set({ isGoLiveActive: true, activeSession: session });
  },

  endGoLive: () => {
    const session = get().activeSession;
    if (!session) return;
    const closed = { ...session, endedAt: Date.now() };
    set((s) => ({
      isGoLiveActive: false,
      activeSession: null,
      pastSessions: [closed, ...s.pastSessions],
    }));
  },

  addMessage: (msg) =>
    set((s) => {
      if (!s.activeSession) return s;
      return {
        activeSession: {
          ...s.activeSession,
          messages: [...s.activeSession.messages, msg],
        },
      };
    }),

  setActiveModule: (mod) => set({ activeModule: mod }),

  addOrientationDoc: (doc) =>
    set((s) => ({ orientationDocs: [...s.orientationDocs, doc] })),

  logPhiAudit: (entry) =>
    set((s) => ({ phiAuditLog: [...s.phiAuditLog, entry] })),

  setVoiceMode: (on) => set({ isVoiceMode: on }),
  setFellitoSpeaking: (speaking) => set({ isFellitoSpeaking: speaking }),
  clearProfile: () => set({ consultantProfile: null }),
}));
