import { create } from 'zustand';
import { AuthUser } from '@/services/authService';
import { StyleProfile } from '../services/styleProfileService';

export interface ConsultantProfile {
  name: string;
  role: string;
  preferredLanguage: string;
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

export type TicketSeverity = 'low' | 'medium' | 'high' | 'critical';
export type TicketStatus = 'open' | 'in-progress' | 'resolved' | 'closed';

export interface CCTicket {
  id: string;
  ticketNumber: string;       // command center reference #
  title: string;
  description: string;
  module: string;
  department: string;
  severity: TicketSeverity;
  status: TicketStatus;
  assignedAnalyst: string;    // who at command center picked it up
  updates: TicketUpdate[];
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
}

export interface TicketUpdate {
  id: string;
  note: string;
  timestamp: number;
  author: string;
}

interface AppState {
  authUser: AuthUser | null;
  consultantProfile: ConsultantProfile | null;
  isGoLiveActive: boolean;
  activeSession: GoLiveSession | null;
  pastSessions: GoLiveSession[];
  orientationDocs: OrientationDoc[];
  phiAuditLog: PhiAuditEntry[];
  activeModule: string;
  activeDepartment: string;
  isVoiceMode: boolean;
  isFellitoSpeaking: boolean;
  creatorOverrides: string[];
  tickets: CCTicket[];
  styleProfile: StyleProfile | null;

  setAuthUser: (user: AuthUser | null) => void;
  setConsultantProfile: (profile: ConsultantProfile) => void;
  startGoLive: () => void;
  endGoLive: () => void;
  addMessage: (msg: ChatMessage) => void;
  setActiveModule: (mod: string) => void;
  setActiveDepartment: (dept: string) => void;
  addOrientationDoc: (doc: OrientationDoc) => void;
  logPhiAudit: (entry: PhiAuditEntry) => void;
  setVoiceMode: (on: boolean) => void;
  setFellitoSpeaking: (speaking: boolean) => void;
  clearProfile: () => void;
  addCreatorOverride: (instruction: string) => void;
  clearCreatorOverrides: () => void;
  addTicket: (ticket: CCTicket) => void;
  updateTicket: (id: string, updates: Partial<CCTicket>) => void;
  addTicketUpdate: (ticketId: string, note: string, author: string) => void;
  deleteTicket: (id: string) => void;
  setStyleProfile: (profile: StyleProfile) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  authUser: null,
  consultantProfile: null,
  isGoLiveActive: false,
  activeSession: null,
  pastSessions: [],
  orientationDocs: [],
  phiAuditLog: [],
  activeModule: 'General',
  activeDepartment: '',
  isVoiceMode: false,
  isFellitoSpeaking: false,
  creatorOverrides: [],
  tickets: [],
  styleProfile: null,

  setAuthUser: (user) => set({ authUser: user }),
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
  setActiveDepartment: (dept) => set({ activeDepartment: dept }),

  addOrientationDoc: (doc) =>
    set((s) => ({ orientationDocs: [...s.orientationDocs, doc] })),

  logPhiAudit: (entry) =>
    set((s) => ({ phiAuditLog: [...s.phiAuditLog, entry] })),

  setVoiceMode: (on) => set({ isVoiceMode: on }),
  setFellitoSpeaking: (speaking) => set({ isFellitoSpeaking: speaking }),
  clearProfile: () => set({ consultantProfile: null }),
  addCreatorOverride: (instruction) =>
    set((s) => ({ creatorOverrides: [...s.creatorOverrides, instruction] })),
  clearCreatorOverrides: () => set({ creatorOverrides: [] }),

  addTicket: (ticket) =>
    set((s) => ({ tickets: [ticket, ...s.tickets] })),

  updateTicket: (id, updates) =>
    set((s) => ({
      tickets: s.tickets.map((t) =>
        t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
      ),
    })),

  addTicketUpdate: (ticketId, note, author) =>
    set((s) => ({
      tickets: s.tickets.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              updatedAt: Date.now(),
              updates: [
                ...t.updates,
                { id: `u_${Date.now()}`, note, timestamp: Date.now(), author },
              ],
            }
          : t
      ),
    })),

  deleteTicket: (id) =>
    set((s) => ({ tickets: s.tickets.filter((t) => t.id !== id) })),

  setStyleProfile: (profile) => set({ styleProfile: profile }),
}));
