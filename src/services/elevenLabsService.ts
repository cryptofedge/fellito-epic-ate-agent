import { Audio } from 'expo-av';
import { useAppStore } from '@/store/appStore';

// Separate ElevenLabs key — never reused from any other project
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';

const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.3,
  use_speaker_boost: true,
};

const MODEL_ID = 'eleven_multilingual_v2';

let currentSound: Audio.Sound | null = null;

export async function speakAsFellito(text: string): Promise<void> {
  const store = useAppStore.getState();
  store.setFellitoSpeaking(true);

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice_settings: VOICE_SETTINGS, model_id: MODEL_ID }),
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
