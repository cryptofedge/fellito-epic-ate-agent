import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore, GoLiveSession, ChatMessage } from '@/store/appStore';
import { BRANDING } from '@/constants/persona';

type Props = NativeStackScreenProps<RootStackParamList, 'SessionLog'>;

export default function SessionLogScreen({ navigation }: Props) {
  const { pastSessions, activeSession } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const allSessions = [
    ...(activeSession ? [activeSession] : []),
    ...pastSessions,
  ];

  const filteredSessions = searchQuery.trim()
    ? allSessions.filter((s) =>
        s.messages.some((m) =>
          m.content.toLowerCase().includes(searchQuery.toLowerCase())
        ) || s.eventName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allSessions;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Session Log</Text>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search Q&A history..."
          placeholderTextColor={BRANDING.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredSessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <SessionCard
            session={item}
            isExpanded={expandedSession === item.id}
            searchQuery={searchQuery}
            onToggle={() =>
              setExpandedSession(expandedSession === item.id ? null : item.id)
            }
          />
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No sessions yet. Sessions are recorded when a Go-Live is active.</Text>
        }
      />
    </SafeAreaView>
  );
}

function SessionCard({
  session, isExpanded, searchQuery, onToggle,
}: {
  session: GoLiveSession;
  isExpanded: boolean;
  searchQuery: string;
  onToggle: () => void;
}) {
  const duration = session.endedAt
    ? Math.round((session.endedAt - session.startedAt) / 60000)
    : null;

  const filteredMessages = searchQuery.trim()
    ? session.messages.filter((m) =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : session.messages;

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={onToggle} style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{session.eventName}</Text>
          <Text style={styles.cardMeta}>
            {new Date(session.startedAt).toLocaleDateString()} ·{' '}
            {session.messages.length} exchanges ·{' '}
            {duration !== null ? `${duration}m` : 'Active'}
          </Text>
        </View>
        <Text style={styles.chevron}>{isExpanded ? '▼' : '▶'}</Text>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.messageList}>
          {filteredMessages.map((msg) => (
            <MessageRow key={msg.id} msg={msg} highlight={searchQuery} />
          ))}
          {filteredMessages.length === 0 && (
            <Text style={styles.noMatchText}>No messages match "{searchQuery}"</Text>
          )}
        </View>
      )}
    </View>
  );
}

function MessageRow({ msg, highlight }: { msg: ChatMessage; highlight: string }) {
  const isUser = msg.role === 'user';
  return (
    <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}>
      <Text style={styles.msgRole}>{isUser ? 'YOU' : 'FELLITO'}</Text>
      <Text style={styles.msgContent}>{msg.content}</Text>
      <Text style={styles.msgTime}>
        {msg.module ? `${msg.module} · ` : ''}{new Date(msg.timestamp).toLocaleTimeString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRANDING.bgColor },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BRANDING.borderColor, gap: 12,
  },
  backBtn: { padding: 4 },
  backText: { color: BRANDING.accentColor, fontSize: 15, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: BRANDING.textPrimary },
  searchBar: { padding: 12 },
  searchInput: {
    backgroundColor: BRANDING.cardColor, borderRadius: 10,
    padding: 12, color: BRANDING.textPrimary, fontSize: 15,
    borderWidth: 1, borderColor: BRANDING.borderColor,
  },
  list: { padding: 12, paddingBottom: 48 },
  card: {
    backgroundColor: BRANDING.cardColor, borderRadius: 12,
    marginBottom: 12, borderWidth: 1, borderColor: BRANDING.borderColor, overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: BRANDING.textPrimary },
  cardMeta: { fontSize: 12, color: BRANDING.textSecondary, marginTop: 2 },
  chevron: { color: BRANDING.textSecondary, fontSize: 14 },
  messageList: { borderTopWidth: 1, borderTopColor: BRANDING.borderColor, padding: 12, gap: 10 },
  msgRow: { borderRadius: 8, padding: 12 },
  msgRowUser: { backgroundColor: '#0a1a20' },
  msgRowAssistant: { backgroundColor: '#0a0a1a' },
  msgRole: { fontSize: 10, fontWeight: '800', color: BRANDING.accentColor, letterSpacing: 1.5, marginBottom: 4 },
  msgContent: { fontSize: 13, color: BRANDING.textPrimary, lineHeight: 18 },
  msgTime: { fontSize: 10, color: BRANDING.textSecondary, marginTop: 6 },
  noMatchText: { fontSize: 13, color: BRANDING.textSecondary, textAlign: 'center', padding: 12 },
  emptyText: { fontSize: 14, color: BRANDING.textSecondary, textAlign: 'center', padding: 32, lineHeight: 20 },
});
