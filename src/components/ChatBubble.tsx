import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { ChatMessage } from '@/store/appStore';
import { BRANDING } from '@/constants/persona';

export default function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <View style={styles.wrapperUser}>
        <View style={styles.bubbleUser}>
          <Text style={styles.textUser}>{message.content}</Text>
        </View>
        <Text style={styles.metaUser}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapperAssistant}>
      <Image
        source={require('../assets/fellito-avatar.png')}
        style={styles.avatar}
        resizeMode="cover"
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.agentLabel}>FELLITO</Text>
        <View style={styles.bubbleAssistant}>
          <Text style={styles.textAssistant}>{message.content}</Text>
        </View>
        <Text style={styles.metaAssistant}>
          {message.module ? `${message.module} · ` : ''}
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapperUser: { alignSelf: 'flex-end', maxWidth: '80%', marginBottom: 16 },
  wrapperAssistant: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    maxWidth: '90%', marginBottom: 16,
  },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1, borderColor: BRANDING.accentColor, marginTop: 2,
  },
  agentLabel: {
    fontSize: 10, fontWeight: '800', color: BRANDING.accentColor,
    letterSpacing: 1.5, marginBottom: 4,
  },
  bubbleUser: {
    backgroundColor: BRANDING.accentColor, borderRadius: 14,
    borderBottomRightRadius: 4, padding: 14,
  },
  bubbleAssistant: {
    backgroundColor: BRANDING.cardColor, borderRadius: 14,
    borderBottomLeftRadius: 4, padding: 14,
    borderWidth: 1, borderColor: BRANDING.borderColor,
  },
  textUser: { color: '#000', fontWeight: '500', fontSize: 15, lineHeight: 22 },
  textAssistant: { color: BRANDING.textPrimary, fontSize: 15, lineHeight: 22 },
  metaUser: { fontSize: 10, color: BRANDING.textSecondary, marginTop: 4, textAlign: 'right' },
  metaAssistant: { fontSize: 10, color: BRANDING.textSecondary, marginTop: 4 },
});
