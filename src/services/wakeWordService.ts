/**
 * Wake word detection — "Hey Fellito"
 *
 * Native (iOS/Android): expo-speech-recognition — runs on-device, no network needed
 * Web: Web Speech API (Chrome/Edge)
 *
 * Both paths restart automatically on silence/timeout so the listener stays alive.
 */

import { Platform } from 'react-native';

type WakeCallback = () => void;

const WAKE_PHRASES = ['hey fellito', 'fellito', 'hey felito', 'hey philito', 'a fellito'];

function transcriptMatchesWakeWord(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return WAKE_PHRASES.some((phrase) => lower.includes(phrase));
}

// ─── Native implementation (expo-speech-recognition) ──────────────────────────

class NativeWakeWordListener {
  private onWake: WakeCallback | null = null;
  private active = false;
  private ExpoSpeech: any = null;

  get isSupported(): boolean {
    if (Platform.OS === 'web') return false;
    try {
      this.ExpoSpeech = require('expo-speech-recognition');
      return true;
    } catch {
      return false;
    }
  }

  async start(onWake: WakeCallback) {
    if (this.active) return;
    this.onWake = onWake;
    this.active = true;
    await this._startListening();
  }

  private async _startListening() {
    if (!this.active || !this.ExpoSpeech) return;
    const { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } = this.ExpoSpeech;

    try {
      const available = await ExpoSpeechRecognitionModule.isRecognitionAvailable();
      if (!available) { this.active = false; return; }

      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        continuous: true,
        interimResults: true,
        requiresOnDeviceRecognition: false,
      });
    } catch {
      // Retry after a delay
      setTimeout(() => this._startListening(), 2000);
    }
  }

  stop() {
    this.active = false;
    this.onWake = null;
    try {
      const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
      ExpoSpeechRecognitionModule.stop();
    } catch {}
  }

  handleResult(transcript: string) {
    if (this.active && transcriptMatchesWakeWord(transcript)) {
      this.stop();
      this.onWake?.();
    }
  }

  handleEnd() {
    if (this.active) {
      setTimeout(() => this._startListening(), 800);
    }
  }
}

// ─── Web implementation (Web Speech API) ──────────────────────────────────────

class WebWakeWordListener {
  private recognition: any = null;
  private onWake: WakeCallback | null = null;
  private active = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  get isSupported(): boolean {
    return (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    );
  }

  start(onWake: WakeCallback) {
    if (!this.isSupported || this.active) return;
    this.onWake = onWake;
    this.active = true;
    this._createAndStart();
  }

  stop() {
    this.active = false;
    this.onWake = null;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.recognition) {
      try { this.recognition.stop(); } catch {}
      this.recognition = null;
    }
  }

  private _createAndStart() {
    if (!this.active) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    this.recognition = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.maxAlternatives = 3;

    rec.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        for (let j = 0; j < event.results[i].length; j++) {
          if (transcriptMatchesWakeWord(event.results[i][j].transcript)) {
            rec.stop();
            this.onWake?.();
            return;
          }
        }
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.active = false;
        return;
      }
      this._scheduleRestart();
    };

    rec.onend = () => { if (this.active) this._scheduleRestart(); };

    try { rec.start(); } catch { this._scheduleRestart(); }
  }

  private _scheduleRestart() {
    if (!this.active) return;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => this._createAndStart(), 1000);
  }
}

// ─── Unified service ──────────────────────────────────────────────────────────

class WakeWordService {
  private native = new NativeWakeWordListener();
  private web = new WebWakeWordListener();
  private _isListening = false;

  get isSupported(): boolean {
    return this.native.isSupported || this.web.isSupported;
  }

  get isListening(): boolean {
    return this._isListening;
  }

  async start(onWake: WakeCallback) {
    if (this._isListening) return;
    this._isListening = true;

    const wrappedCallback = () => {
      this._isListening = false;
      onWake();
    };

    if (Platform.OS !== 'web' && this.native.isSupported) {
      await this.native.start(wrappedCallback);
    } else if (this.web.isSupported) {
      this.web.start(wrappedCallback);
    } else {
      this._isListening = false;
    }
  }

  stop() {
    this._isListening = false;
    this.native.stop();
    this.web.stop();
  }

  // Call this from useSpeechRecognitionEvent handlers in the component
  handleNativeResult(transcript: string) {
    this.native.handleResult(transcript);
  }

  handleNativeEnd() {
    this.native.handleEnd();
  }
}

export const wakeWordService = new WakeWordService();
