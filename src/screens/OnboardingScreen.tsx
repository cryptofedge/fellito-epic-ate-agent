import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/appStore';
import { BRANDING } from '@/constants/persona';
import { EPIC_MODULES, MODULE_GROUPS_WITH_MODULES } from '@/constants/modules';
import ModuleChip from '@/components/ModuleChip';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

// 3-step onboarding: Profile → Go-Live Event → Module Assignment
type Step = 1 | 2 | 3;

export default function OnboardingScreen({ navigation }: Props) {
  const { setConsultantProfile } = useAppStore();
  const [step, setStep] = useState<Step>(1);

  // Step 1 — Profile
  const [name, setName] = useState('');
  const [role, setRole] = useState('');

  // Step 2 — Go-Live Event
  const [eventName, setEventName] = useState('');
  const [goLiveDate, setGoLiveDate] = useState('');

  // Step 3 — Modules
  const [selectedModules, setSelectedModules] = useState<string[]>([]);

  const toggleModule = (id: string) => {
    setSelectedModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const canStep1 = name.trim().length > 0 && role.trim().length > 0;
  const canStep2 = eventName.trim().length > 0 && goLiveDate.trim().length > 0;
  const canStep3 = selectedModules.length > 0;

  const handleFinish = () => {
    if (!canStep3) return;
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
        {/* Header — always visible */}
        <View style={styles.header}>
          <Image
            source={require('../assets/logo.png')}
            style={styles.logoImg}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.logoText}>FELLITO</Text>
            <Text style={styles.tagline}>{BRANDING.tagline}</Text>
          </View>
        </View>

        {/* Step progress dots */}
        <View style={styles.stepRow}>
          {([1, 2, 3] as Step[]).map((s) => (
            <View key={s} style={[styles.stepDot, step >= s && styles.stepDotActive]} />
          ))}
        </View>

        {/* ── STEP 1: Profile ── */}
        {step === 1 && (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.avatarRow}>
              <Image
                source={require('../assets/fellito-avatar.png')}
                style={styles.avatar}
                resizeMode="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>Who are you?</Text>
                <Text style={styles.stepSub}>Let Fellito know who he's rolling with on this Go-Live.</Text>
              </View>
            </View>

            <Text style={styles.label}>FULL NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={BRANDING.textSecondary}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <Text style={styles.label}>YOUR ROLE</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. ATE Consultant, Super User, Go-Live Lead"
              placeholderTextColor={BRANDING.textSecondary}
              value={role}
              onChangeText={setRole}
            />

            <TouchableOpacity
              style={[styles.cta, !canStep1 && styles.ctaDisabled]}
              onPress={() => canStep1 && setStep(2)}
              disabled={!canStep1}
            >
              <Text style={styles.ctaText}>NEXT →</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ── STEP 2: Go-Live Event ── */}
        {step === 2 && (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.stepTitle}>Which Go-Live?</Text>
            <Text style={styles.stepSub}>Tell Fellito where he's showing up.</Text>

            <Text style={styles.label}>ORGANIZATION / EVENT NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. St. Mary's Epic Go-Live Phase 1"
              placeholderTextColor={BRANDING.textSecondary}
              value={eventName}
              onChangeText={setEventName}
              autoCapitalize="words"
            />

            <Text style={styles.label}>GO-LIVE START DATE</Text>
            <TextInput
              style={styles.input}
              placeholder="MM/DD/YYYY"
              placeholderTextColor={BRANDING.textSecondary}
              value={goLiveDate}
              onChangeText={setGoLiveDate}
              keyboardType="numbers-and-punctuation"
            />

            <View style={styles.navRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cta, styles.ctaFlex, !canStep2 && styles.ctaDisabled]}
                onPress={() => canStep2 && setStep(3)}
                disabled={!canStep2}
              >
                <Text style={styles.ctaText}>NEXT →</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ── STEP 3: Module Assignment ── */}
        {step === 3 && (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.stepTitle}>Your modules</Text>
            <Text style={styles.stepSub}>
              What are you covering on this Go-Live? Fellito will prioritize these.
            </Text>

            {MODULE_GROUPS_WITH_MODULES.map(({ group, modules }) => (
              <View key={group}>
                <Text style={styles.groupLabel}>{group}</Text>
                <View style={styles.chipGrid}>
                  {modules.map((mod) => (
                    <ModuleChip
                      key={mod.id}
                      label={mod.name}
                      selected={selectedModules.includes(mod.id)}
                      onPress={() => toggleModule(mod.id)}
                    />
                  ))}
                </View>
              </View>
            ))}

            <View style={styles.navRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cta, styles.ctaFlex, !canStep3 && styles.ctaDisabled]}
                onPress={handleFinish}
                disabled={!canStep3}
              >
                <Text style={styles.ctaText}>LET'S GO ⚡</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.powered}>{BRANDING.poweredBy}</Text>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRANDING.bgColor },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  logoImg: { width: 44, height: 54 },
  logoText: { fontSize: 26, fontWeight: '900', color: BRANDING.accentColor, letterSpacing: 5 },
  tagline: { fontSize: 11, color: BRANDING.textSecondary, letterSpacing: 1.5, textTransform: 'uppercase' },
  stepRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12,
  },
  stepDot: {
    width: 28, height: 4, borderRadius: 2, backgroundColor: BRANDING.borderColor,
  },
  stepDotActive: { backgroundColor: BRANDING.accentColor },
  scroll: { padding: 20, paddingBottom: 48 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 2, borderColor: BRANDING.accentColor,
  },
  stepTitle: { fontSize: 22, fontWeight: '900', color: BRANDING.textPrimary, marginBottom: 4 },
  stepSub: { fontSize: 13, color: BRANDING.textSecondary, lineHeight: 18, marginBottom: 24 },
  label: {
    fontSize: 10, fontWeight: '700', color: BRANDING.accentColor,
    letterSpacing: 2, marginBottom: 8, marginTop: 16,
  },
  input: {
    backgroundColor: BRANDING.cardColor,
    borderColor: BRANDING.borderColor,
    borderWidth: 1, borderRadius: 10,
    padding: 14, color: BRANDING.textPrimary, fontSize: 15,
    marginBottom: 4,
  },
  groupLabel: {
    fontSize: 10, fontWeight: '700', color: BRANDING.textSecondary,
    letterSpacing: 1.5, marginTop: 20, marginBottom: 10,
    textTransform: 'uppercase',
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 28 },
  backBtn: { paddingVertical: 14, paddingHorizontal: 16 },
  backBtnText: { color: BRANDING.textSecondary, fontSize: 15, fontWeight: '600' },
  cta: {
    backgroundColor: BRANDING.accentColor,
    borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 28,
  },
  ctaFlex: { flex: 1, marginTop: 0 },
  ctaDisabled: { opacity: 0.35 },
  ctaText: { color: '#000', fontWeight: '900', fontSize: 15, letterSpacing: 2 },
  powered: { fontSize: 11, color: BRANDING.textSecondary, textAlign: 'center', marginTop: 32 },
});
