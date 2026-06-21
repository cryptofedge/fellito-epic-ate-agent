import { Audio } from 'expo-av';
import { useAppStore } from '@/store/appStore';
import { authHeaders } from './authService';
import { StyleProfile } from './styleProfileService';

// Separate ElevenLabs key — never reused from any other project
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';

const MODEL_ID = 'eleven_multilingual_v2';

interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

// Base voice — Fellito's natural delivery
const BASE_VOICE: VoiceSettings = {
  stability: 0.50,
  similarity_boost: 0.75,
  style: 0.30,
  use_speaker_boost: true,
};

// Presets tuned for each energy level:
//   hype  → lower stability (more expressive variance), high style exaggeration
//   medium → balanced
//   chill → higher stability (smooth, steady, no peaks)
const ENERGY_PRESETS: Record<string, VoiceSettings> = {
  hype: {
    stability: 0.28,        // expressive, punchy — lets voice vary more
    similarity_boost: 0.82, // stay in character
    style: 0.72,            // strong style exaggeration — swagger on max
    use_speaker_boost: true,
  },
  medium: {
    stability: 0.48,
    similarity_boost: 0.78,
    style: 0.42,
    use_speaker_boost: true,
  },
  chill: {
    stability: 0.68,        // smooth, consistent — no big swings
    similarity_boost: 0.72,
    style: 0.18,            // understated, cool
    use_speaker_boost: false,
  },
};

function buildVoiceSettings(profile: StyleProfile | null): VoiceSettings {
  if (!profile || profile.messageCount < 3) return BASE_VOICE;

  const preset = ENERGY_PRESETS[profile.energyLevel] ?? BASE_VOICE;

  // Fine-tune on top of the preset based on specific habits
  let { stability, similarity_boost, style, use_speaker_boost } = preset;

  // Punchy senders → tighten delivery (less drift between words)
  if (profile.prefersPunchy) stability = Math.max(0.22, stability - 0.05);

  // Heavy slang/emoji users → more style exaggeration
  if (profile.slangTerms.length >= 5) style = Math.min(0.90, style + 0.10);

  // Exclamation-heavy users → bump expressiveness
  if (profile.usesExclamations) stability = Math.max(0.20, stability - 0.04);

  // Clamp all to valid ElevenLabs ranges
  stability = Math.max(0.0, Math.min(1.0, stability));
  similarity_boost = Math.max(0.0, Math.min(1.0, similarity_boost));
  style = Math.max(0.0, Math.min(1.0, style));

  return { stability, similarity_boost, style, use_speaker_boost };
}

let currentSound: Audio.Sound | null = null;

export async function speakAsFellito(text: string): Promise<void> {
  const store = useAppStore.getState();
  store.setFellitoSpeaking(true);

  const voiceSettings = buildVoiceSettings(store.styleProfile);

  try {
    // Stop any current playback
    if (currentSound) {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
      currentSound = null;
    }

    // Request audio from backend (keeps API key server-side)
    const response = await fetch(`${BACKEND_URL}/api/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ text, voice_settings: voiceSettings, model_id: MODEL_ID }),
    });

    if (!response.ok) {
      throw new Error(`Voice API error: ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync({ uri: url });
    currentSound = sound;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        useAppStore.getState().setFellitoSpeaking(false);
        sound.unloadAsync();
        currentSound = null;
      }
    });

    await sound.playAsync();
  } catch (err) {
    console.error('[ElevenLabs] Voice error:', err);
    useAppStore.getState().setFellitoSpeaking(false);
  }
}

export async function stopFellitoVoice(): Promise<void> {
  if (currentSound) {
    await currentSound.stopAsync();
    await currentSound.unloadAsync();
    currentSound = null;
  }
  useAppStore.getState().setFellitoSpeaking(false);
}
