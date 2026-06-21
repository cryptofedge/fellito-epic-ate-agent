import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { EpicModule } from '@/constants/modules';
import { BRANDING } from '@/constants/persona';

interface Props {
  modules: EpicModule[];
  activeModule: string;
  onSelect: (name: string) => void;
}

export default function ModuleTabBar({ modules, activeModule, onSelect }: Props) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <TouchableOpacity
          style={[styles.tab, activeModule === 'General' && styles.tabActive]}
          onPress={() => onSelect('General')}
        >
          <Text style={[styles.tabText, activeModule === 'General' && styles.tabTextActive]}>
            General
          </Text>
        </TouchableOpacity>

        {modules.map((mod) => (
          <TouchableOpacity
            key={mod.id}
            style={[styles.tab, activeModule === mod.name && styles.tabActive]}
            onPress={() => onSelect(mod.name)}
          >
            <Text style={[styles.tabText, activeModule === mod.name && styles.tabTextActive]}>
              {mod.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1, borderBottomColor: BRANDING.borderColor,
    backgroundColor: BRANDING.bgColor,
  },
  scroll: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  tab: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, backgroundColor: BRANDING.cardColor,
    borderWidth: 1, borderColor: BRANDING.borderColor,
  },
  tabActive: {
    backgroundColor: `${BRANDING.accentColor}18`,
    borderColor: BRANDING.accentColor,
  },
  tabText: { fontSize: 13, color: BRANDING.textSecondary, fontWeight: '500' },
  tabTextActive: { color: BRANDING.accentColor, fontWeight: '700' },
});
