import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/appStore';
import { BRANDING } from '@/constants/persona';
import { EPIC_MODULES } from '@/constants/modules';
import ModuleChip from '@/components/ModuleChip';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

export default function OnboardingScreen({ navigation }: Props) {
  const { setConsultantProfile } = useAppStore();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [eventName, setEventName] = useState('');
  const [goLiveDate, setGoLiveDate] = useState('');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);

  const toggleModule = (id: string) => {
    setSelectedModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const canSubmit = name.trim() && role.trim() && eventName.trim() && goLiveDate.trim() && selectedModules.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setConsultantProfile({
      name: name.trim(),
      role: role.trim(),
      assignedModules: selectedModules,
      goLiveEventName: eventName.trim(),
      goLiveStartDate: goLiveDate.trim(),
      goLiveEndDate: '',
    });
    navigation.replace('Standby');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.logo}>FELLITO</Text>
          <Text style={styles.sub}>{BRANDING.tagline}</Text>
          <Text style={styles.powered}>{BRANDING.poweredBy}</Text>

          <Text style={styles.sectionLabel}>YOUR PROFILE</Text>

          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor={BRANDING.textSecondary}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Role (e.g. ATE Consultant, Super User, Go-Live Lead)"
            placeholderTextColor={BRANDING.textSecondary}
            value={role}
            onChangeText={setRole}
          />

          <Text style={styles.sectionLabel}>GO-LIVE EVENT</Text>

          <TextInput
            style={styles.input}
            placeholder="Organization / Event name"
            placeholderTextColor={BRANDING.textSecondary}
            value={eventName}
            onChangeText={setEventName}
          />
          <TextInput
            style={styles.input}
            placeholder="Go-Live start date (MM/DD/YYYY)"
            placeholderTextColor={BRANDING.textSecondary}
            value={goLiveDate}
            onChangeText={setGoLiveDate}
            keyboardType="numbers-and-punctuation"
          />

          <Text style={styles.sectionLabel}>ASSIGNED MODULES</Text>
          <Text style={styles.sectionHint}>Select all that apply to your assignment</Text>

          <View style={styles.chipGrid}>
            {EPIC_MODULES.map((mod) => (
              <ModuleChip
                key={mod.id}
                label={mod.name}
                selected={selectedModules.includes(mod.id)}
                onPress={() => toggleModule(mod.id)}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.cta, !canSubmit && styles.ctaDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            <Text style={styles.ctaText}>LET'S GO</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRANDING.bgColor },
  scroll: { padding: 24, paddingBottom: 48 },
  logo: { fontSize: 42, fontWeight: '900', color: BRANDING.accentColor, letterSpacing: 6, marginTop: 16 },
  sub: { fontSize: 14, color: BRANDING.textSecondary, marginTop: 4, letterSpacing: 2, textTransform: 'uppercase' },
  powered: { fontSize: 11, color: BRANDING.textSecondary, marginTop: 2, marginBottom: 32 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: BRANDING.accentColor, letterSpacing: 2, marginTop: 24, marginBottom: 8 },
  sectionHint: { fontSize: 12, color: BRANDING.textSecondary, marginBottom: 12 },
  input: {
    backgroundColor: BRANDING.cardColor,
    borderColor: BRANDING.borderColor,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    color: BRANDING.textPrimary,
    fontSize: 15,
    marginBottom: 12,
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  cta: {
    marginTop: 32,
    backgroundColor: BRANDING.accentColor,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.35 },
  ctaText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 3 },
});
