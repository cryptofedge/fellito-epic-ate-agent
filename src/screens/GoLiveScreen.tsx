import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore, ChatMessage } from '@/store/appStore';
import { BRANDING } from '@/constants/persona';
import { EPIC_MODULES } from '@/constants/modules';
import { askFellito } from '@/services/anthropicService';
import { speakAsFellito, stopFellitoVoice } from '@/services/elevenLabsService';
import { scanForPhi, logPhiWarningShown } from '@/services/phiGuard';
import { wakeWordService } from '@/services/wakeWordService';
import PhiWarningModal from '@/components/PhiWarningModal';
import ChatBubble from '@/components/ChatBubble';
import ModuleTabBar from '@/components/ModuleTabBar';

type Props = NativeStackScreenProps<RootStackParamList, 'GoLive'>;

export default function GoLiveScreen({ navigation }: Props) {
  const {
    consultantProfile, activeSession, activeModule, authUser,
    setActiveModule, addMessage, endGoLive,
    isVoiceMode, setVoiceMode, isFellitoSpeaking,
    creatorOverrides, addCreatorOverride,
  } = useAppStore();

  const isCreator = authUser?.role === 'owner';

  // Stop wake word listener when GoLive is active — mic is in use
  useEffect(() => {
    wakeWordService.stop();
  }, []);

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [showPhiWarning, setShowPhiWarning] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const assignedModules = EPIC_MODULES.filter((m) =>
    consultantProfile?.assignedModules.includes(m.id)
  );

  useEffect(() => {
    if ((activeSession?.messages.length ?? 0) > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [activeSession?.messages.length]);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const phiScan = scanForPhi(trimmed);
    if (phiScan.hasPotentialPhi) {
      setPendingMessage(trimmed);
      setShowPhiWarning(true);
      return;
    }

    await sendMessage(trimmed);
  };

  const sendMessage = async (text: string) => {
    setInputText('');
    setIsLoading(true);

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      module: activeModule,
    };
    addMessage(userMsg);

    try {
      const result = await askFellito(
        text,
        activeSession?.messages ?? [],
        activeModule,
        activeSession?.id ?? '',
        isCreator,
        creatorOverrides,
        consultantProfile?.preferredLanguage ?? 'en'
      );

      // If creator sent an override command, store it for future messages
      if (isCreator && text.startsWith('>>')) {
        addCreatorOverride(text.slice(2).trim());
      }

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: result.text,
        timestamp: Date.now(),
        module: activeModule,
      };
      addMessage(assistantMsg);

      if (isVoiceMode) {
        await speakAsFellito(result.text);
      }
    } catch (err) {
      const errMsg: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content: "Yo, I hit a connection issue. Check your network and try again.",
        timestamp: Date.now(),
      };
      addMessage(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhiConfirm = () => {
    logPhiWarningShown('chat', true);
    setShowPhiWarning(false);
    sendMessage(pendingMessage);
    setPendingMessage('');
  };

  const handlePhiCancel = () => {
    logPhiWarningShown('chat', false);
    setShowPhiWarning(false);
    setPendingMessage('');
  };

  const handleEndGoLive = () => {
    Alert.alert(
      'End Go-Live?',
      'This will close the active session and move Fellito back to standby.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: () => {
            stopFellitoVoice();
            endGoLive();
            navigation.replace('Standby');
          },
        },
      ]
    );
  };

  const messages = activeSession?.messages ?? [];
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={require('../assets/fellito-avatar.png')} style={styles.headerAvatar} resizeMode="cover" />
          <View>
            <Text style={styles.headerTitle}>FELLITO</Text>
            {isCreator ? (
              <View style={styles.creatorBadge}>
                <Text style={styles.creatorBadgeText}>🔑 CREATOR MODE</Text>
              </View>
            ) : (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>GO-LIVE ACTIVE</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('OrientationUpload')}
          >
            <Text style={styles.iconBtnText}>📄</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('SessionLog')}
          >
            <Text style={styles.iconBtnText}>📋</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.endBtn} onPress={handleEndGoLive}>
            <Text style={styles.endBtnText}>END</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Module Tab Bar */}
      <ModuleTabBar
        modules={assignedModules}
        activeModule={activeModule}
        onSelect={setActiveModule}
      />

      {/* Chat */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatBubble message={item} />}
          contentContainerStyle={styles.chatContent}
          ListEmptyComponent={<EmptyState module={activeModule} />}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Escalation quick-access when Fellito has spoken */}
        {lastAssistantMessage && (
          <TouchableOpacity
            style={styles.escalateBtn}
            onPress={() =>
              navigation.navigate('Escalation', {
                issueSummary: lastAssistantMessage.content.substring(0, 300),
              })
            }
          >
            <Text style={styles.escalateBtnText}>⬆ Escalate to Command Center</Text>
          </TouchableOpacity>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TouchableOpacity
            style={[styles.voiceToggle, isVoiceMode && styles.voiceToggleActive]}
            onPress={() => {
              if (isVoiceMode && isFellitoSpeaking) stopFellitoVoice();
              setVoiceMode(!isVoiceMode);
            }}
          >
            <Text style={styles.voiceToggleIcon}>{isVoiceMode ? '🔊' : '🔇'}</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder={isCreator ? `>> to override behavior, or ask Fellito anything...` : `Ask Fellito about ${activeModule}...`}
            placeholderTextColor={BRANDING.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => handleSend(inputText)}
          />

          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || isLoading) && styles.sendBtnDisabled]}
            onPress={() => handleSend(inputText)}
            disabled={!inputText.trim() || isLoading}
          >
            <Text style={styles.sendBtnText}>{isLoading ? '...' : '→'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <PhiWarningModal
        visible={showPhiWarning}
        onConfirm={handlePhiConfirm}
        onCancel={handlePhiCancel}
      />
    </SafeAreaView>
  );
}

function EmptyState({ module }: { module: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>Fellito's on the floor.</Text>
      <Text style={styles.emptySub}>
        {module === 'General'
          ? "Ask me anything about Epic workflows, escalations, or Go-Live issues."
          : `What's the issue in ${module}? Hit me.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRANDING.bgColor },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BRANDING.borderColor,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: BRANDING.accentColor },
  headerTitle: { fontSize: 20, fontWeight: '900', color: BRANDING.accentColor, letterSpacing: 4 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#00E096' },
  liveText: { fontSize: 10, fontWeight: '700', color: '#00E096', letterSpacing: 1.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 8 },
  iconBtnText: { fontSize: 20 },
  endBtn: {
    backgroundColor: BRANDING.dangerColor, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  endBtnText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 1 },
  chatContent: { padding: 16, paddingBottom: 8, flexGrow: 1 },
  escalateBtn: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#1a1a2a', borderRadius: 10,
    padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: BRANDING.warningColor,
  },
  escalateBtnText: { color: BRANDING.warningColor, fontWeight: '700', fontSize: 13 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: 12, gap: 8,
    borderTopWidth: 1, borderTopColor: BRANDING.borderColor,
    backgroundColor: BRANDING.bgColor,
  },
  voiceToggle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: BRANDING.cardColor,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BRANDING.borderColor,
  },
  voiceToggleActive: { borderColor: BRANDING.accentColor },
  voiceToggleIcon: { fontSize: 18 },
  creatorBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  creatorBadgeText: { fontSize: 10, fontWeight: '800', color: '#FF8C00', letterSpacing: 1 },
  input: {
    flex: 1, backgroundColor: BRANDING.cardColor,
    borderRadius: 10, padding: 12,
    color: BRANDING.textPrimary, fontSize: 15,
    borderWidth: 1, borderColor: BRANDING.borderColor,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: BRANDING.accentColor,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },
  sendBtnText: { color: '#000', fontWeight: '900', fontSize: 20 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, marginTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: BRANDING.textPrimary, marginBottom: 8 },
  emptySub: { fontSize: 14, color: BRANDING.textSecondary, textAlign: 'center', lineHeight: 20 },
});
