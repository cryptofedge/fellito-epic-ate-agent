import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ChatMessage } from '@/store/appStore';
import { BRANDING } from '@/constants/persona';

export default function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.wrapper, isUser ? styles.wrapperUser : styles.wrapperAssistant]}>
      {!isUser && <Text style={styles.agentLabel}>FELLITO</Text>}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.text, isUser ? styles.textUser : styles.textAssistant]}>
          {message.content}
        </Text>
      </View>
      <Text style={[styles.meta, isUser ? styles.metaUser : styles.metaAssistant]}>
        {message.module && !isUser ? `${message.module} · ` : ''}
        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16, maxWidth: '85%' },
  wrapperUser: { alignSelf: 'flex-end' },
  wrapperAssistant: { alignSelf: 'flex-start' },
  agentLabel: {
    fontSize: 10, fontWeight: '800', color: BRANDING.accentColor,
    letterSpacing: 1.5, marginBottom: 4,
  },
  bubble: { borderRadius: 14, padding: 14 },
  bubbleUser: { backgroundColor: BRANDING.accentColor, borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: BRANDING.cardColor, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: BRANDING.borderColor },
  text: { fontSize: 15, lineHeight: 22 },
  textUser: { color: '#000', fontWeight: '500' },
  textAssistant: { color: BRANDING.textPrimary },
  meta: { fontSize: 10, marginTop: 4 },
  metaUser: { color: BRANDING.textSecondary, textAlign: 'right' },
  metaAssistant: { color: BRANDING.textSecondary },
});
