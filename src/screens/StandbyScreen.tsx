import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/appStore';
import { BRANDING } from '@/constants/persona';
import { EPIC_MODULES } from '@/constants/modules';

type Props = NativeStackScreenProps<RootStackParamList, 'Standby'>;

export default function StandbyScreen({ navigation }: Props) {
  const { consultantProfile, startGoLive, pastSessions } = useAppStore();

  const assignedModules = EPIC_MODULES.filter((m) =>
    consultantProfile?.assignedModules.includes(m.id)
  );

  const handleGoLive = () => {
    startGoLive();
    navigation.navigate('GoLive', {});
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <Image source={require('../assets/logo.png')} style={styles.logoImg} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.logo}>FELLITO</Text>
            <Text style={styles.powered}>{BRANDING.poweredBy}</Text>
          </View>
          <Image source={require('../assets/fellito-avatar.png')} style={styles.avatarImg} resizeMode="cover" />
        </View>

        <View style={styles.statusBadge}>
          <View style={styles.dormantDot} />
          <Text style={styles.statusText}>STANDBY — NO ACTIVE GO-LIVE</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>CONSULTANT</Text>
          <Text style={styles.cardValue}>{consultantProfile?.name}</Text>
          <Text style={styles.cardSub}>{consultantProfile?.role}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>NEXT GO-LIVE EVENT</Text>
          <Text style={styles.cardValue}>{consultantProfile?.goLiveEventName ?? '—'}</Text>
          <Text style={styles.cardSub}>{consultantProfile?.goLiveStartDate ?? 'Date TBD'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>ASSIGNED MODULES ({assignedModules.length})</Text>
          <View style={styles.moduleList}>
            {assignedModules.map((mod) => (
              <View key={mod.id} style={styles.moduleRow}>
                <View style={styles.moduleDot} />
                <Text style={styles.moduleText}>{mod.name}</Text>
                <Text style={styles.moduleGroup}>{mod.group}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.goLiveBtn} onPress={handleGoLive}>
          <Text style={styles.goLiveBtnText}>⚡ ACTIVATE GO-LIVE</Text>
        </TouchableOpacity>

        <View style={styles.quickLinks}>
          <TouchableOpacity
            style={styles.quickLink}
            onPress={() => navigation.navigate('OrientationUpload')}
          >
            <Text style={styles.quickLinkText}>📄 Upload Orientation Docs</Text>
          </TouchableOpacity>
          {pastSessions.length > 0 && (
            <TouchableOpacity
              style={styles.quickLink}
              onPress={() => navigation.navigate('SessionLog')}
            >
              <Text style={styles.quickLinkText}>📋 Session Log ({pastSessions.length})</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.disclaimer}>
          Fellito is dormant until a Go-Live is activated. Upload your client's orientation
          documents now so he's ready the moment the Go-Live starts.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRANDING.bgColor },
  scroll: { padding: 24, paddingBottom: 48 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  logoImg: { width: 36, height: 44 },
  avatarImg: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: BRANDING.accentColor },
  logo: { fontSize: 30, fontWeight: '900', color: BRANDING.accentColor, letterSpacing: 5 },
  powered: { fontSize: 11, color: BRANDING.textSecondary },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: BRANDING.cardColor, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start',
    marginBottom: 24, borderWidth: 1, borderColor: BRANDING.borderColor,
  },
  dormantDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#555' },
  statusText: { fontSize: 11, fontWeight: '700', color: BRANDING.textSecondary, letterSpacing: 1.5 },
  card: {
    backgroundColor: BRANDING.cardColor, borderRadius: 12,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: BRANDING.borderColor,
  },
  cardLabel: { fontSize: 10, fontWeight: '700', color: BRANDING.accentColor, letterSpacing: 2, marginBottom: 6 },
  cardValue: { fontSize: 18, fontWeight: '700', color: BRANDING.textPrimary },
  cardSub: { fontSize: 13, color: BRANDING.textSecondary, marginTop: 2 },
  moduleList: { marginTop: 4 },
  moduleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  moduleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BRANDING.accentColor },
  moduleText: { fontSize: 14, color: BRANDING.textPrimary, flex: 1 },
  moduleGroup: { fontSize: 11, color: BRANDING.textSecondary },
  goLiveBtn: {
    backgroundColor: BRANDING.accentColor, borderRadius: 14,
    padding: 20, alignItems: 'center', marginTop: 16, marginBottom: 16,
  },
  goLiveBtnText: { color: '#000', fontWeight: '900', fontSize: 17, letterSpacing: 2 },
  quickLinks: { gap: 10, marginBottom: 24 },
  quickLink: {
    backgroundColor: BRANDING.cardColor, borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: BRANDING.borderColor,
  },
  quickLinkText: { color: BRANDING.textPrimary, fontSize: 14, fontWeight: '600' },
  disclaimer: { fontSize: 12, color: BRANDING.textSecondary, lineHeight: 18, textAlign: 'center' },
});
