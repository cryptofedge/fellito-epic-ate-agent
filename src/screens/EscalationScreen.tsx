import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/appStore';
import { BRANDING } from '@/constants/persona';

type Props = NativeStackScreenProps<RootStackParamList, 'Escalation'>;

const TIER_OPTIONS: { tier: 2 | 3 | 4; label: string; desc: string; color: string }[] = [
  { tier: 2, label: 'Tier 2', desc: 'Command Center Analyst', color: BRANDING.warningColor },
  { tier: 3, label: 'Tier 3', desc: 'Vendor / Epic Backend', color: '#FF6B35' },
  { tier: 4, label: 'Tier 4', desc: 'Epic Hosting / Critical Issue', color: BRANDING.dangerColor },
];

const IMPACT_OPTIONS = ['Safety', 'Revenue', 'Operations'] as const;

export default function EscalationScreen({ navigation, route }: Props) {
  const { activeModule } = useAppStore();
  const [selectedTier, setSelectedTier] = useState<2 | 3 | 4>(2);
  const [selectedImpact, setSelectedImpact] = useState<string>('Operations');
  const [issueText, setIssueText] = useState(route.params?.issueSummary ?? '');
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    if (!issueText.trim()) return;
    // In a real deployment this would POST to Command Center ticket system
    // For now, confirm to user and log
    Alert.alert(
      'Escalation Sent',
      `Tier ${selectedTier} escalation logged for ${activeModule}.\n\nIn production, this posts to your Command Center ticketing system.`,
      [{ text: 'OK', onPress: () => { setSent(true); navigation.goBack(); } }]
    );
  };

  const selectedTierObj = TIER_OPTIONS.find((t) => t.tier === selectedTier)!;

  const autoSummary = `[${activeModule}] [${selectedImpact}] ${issueText.trim()}`.substring(0, 500);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Escalate Issue</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>ESCALATION TIER</Text>
        <View style={styles.tierRow}>
          {TIER_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.tier}
              style={[
                styles.tierChip,
                selectedTier === opt.tier && { borderColor: opt.color, backgroundColor: `${opt.color}18` },
              ]}
              onPress={() => setSelectedTier(opt.tier)}
            >
              <Text style={[styles.tierLabel, selectedTier === opt.tier && { color: opt.color }]}>
                {opt.label}
              </Text>
              <Text style={styles.tierDesc}>{opt.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>IMPACT TYPE</Text>
        <View style={styles.impactRow}>
          {IMPACT_OPTIONS.map((imp) => (
            <TouchableOpacity
              key={imp}
              style={[styles.impactChip, selectedImpact === imp && styles.impactChipActive]}
              onPress={() => setSelectedImpact(imp)}
            >
              <Text style={[styles.impactText, selectedImpact === imp && styles.impactTextActive]}>
                {imp}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>MODULE</Text>
        <View style={styles.moduleDisplay}>
          <Text style={styles.moduleText}>{activeModule}</Text>
        </View>

        <Text style={styles.sectionLabel}>ISSUE DESCRIPTION</Text>
        <TextInput
          style={styles.textarea}
          placeholder="Describe the issue for Command Center. What's happening, what was tried, what's the impact?"
          placeholderTextColor={BRANDING.textSecondary}
          value={issueText}
          onChangeText={setIssueText}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />

        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>ESCALATION SUMMARY PREVIEW</Text>
          <Text style={styles.previewText}>{autoSummary || '(fill in issue description above)'}</Text>
        </View>

        <TouchableOpacity
          style={[styles.sendBtn, !issueText.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!issueText.trim()}
        >
          <Text style={styles.sendBtnText}>
            ⬆ SEND TO {selectedTierObj.label.toUpperCase()}
          </Text>
        </TouchableOpacity>

        <View style={styles.tipCard}>
          <Text style={styles.tipLabel}>FELLITO TIP</Text>
          <Text style={styles.tipText}>
            When you call Command Center: lead with the impact (Safety / Revenue / Operations),
            the module, and the exact error or symptom. Don't say "it's not working" — say
            what specifically is happening and what you've already tried. Gets you a resolution
            twice as fast.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  content: { padding: 20, paddingBottom: 48 },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: BRANDING.accentColor,
    letterSpacing: 2, marginBottom: 10, marginTop: 20,
  },
  tierRow: { flexDirection: 'row', gap: 10 },
  tierChip: {
    flex: 1, borderRadius: 10, padding: 12,
    backgroundColor: BRANDING.cardColor,
    borderWidth: 1, borderColor: BRANDING.borderColor, alignItems: 'center',
  },
  tierLabel: { fontSize: 14, fontWeight: '800', color: BRANDING.textPrimary },
  tierDesc: { fontSize: 10, color: BRANDING.textSecondary, marginTop: 2, textAlign: 'center' },
  impactRow: { flexDirection: 'row', gap: 10 },
  impactChip: {
    flex: 1, borderRadius: 8, padding: 10,
    backgroundColor: BRANDING.cardColor,
    borderWidth: 1, borderColor: BRANDING.borderColor, alignItems: 'center',
  },
  impactChipActive: { borderColor: BRANDING.accentColor, backgroundColor: '#001a20' },
  impactText: { fontSize: 13, fontWeight: '600', color: BRANDING.textSecondary },
  impactTextActive: { color: BRANDING.accentColor },
  moduleDisplay: {
    backgroundColor: BRANDING.cardColor, borderRadius: 8,
    padding: 12, borderWidth: 1, borderColor: BRANDING.borderColor,
  },
  moduleText: { fontSize: 15, fontWeight: '700', color: BRANDING.textPrimary },
  textarea: {
    backgroundColor: BRANDING.cardColor, borderRadius: 10,
    padding: 14, color: BRANDING.textPrimary, fontSize: 14,
    borderWidth: 1, borderColor: BRANDING.borderColor, minHeight: 120,
  },
  previewCard: {
    marginTop: 12, backgroundColor: '#0a0a1a', borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: '#2a2a3a',
  },
  previewLabel: { fontSize: 10, color: BRANDING.textSecondary, letterSpacing: 1.5, marginBottom: 6 },
  previewText: { fontSize: 13, color: BRANDING.textPrimary, lineHeight: 18 },
  sendBtn: {
    marginTop: 20, backgroundColor: BRANDING.dangerColor,
    borderRadius: 12, padding: 18, alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },
  sendBtnText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 2 },
  tipCard: {
    marginTop: 20, backgroundColor: '#0a1a10', borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: BRANDING.successColor,
  },
  tipLabel: { fontSize: 10, fontWeight: '700', color: BRANDING.successColor, letterSpacing: 2, marginBottom: 6 },
  tipText: { fontSize: 13, color: BRANDING.textSecondary, lineHeight: 18 },
});
