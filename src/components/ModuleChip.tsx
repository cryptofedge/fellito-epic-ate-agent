import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { BRANDING } from '@/constants/persona';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export default function ModuleChip({ label, selected, onPress }: Props) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, backgroundColor: BRANDING.cardColor,
    borderWidth: 1, borderColor: BRANDING.borderColor,
  },
  chipSelected: {
    backgroundColor: `${BRANDING.accentColor}20`,
    borderColor: BRANDING.accentColor,
  },
  label: { fontSize: 13, color: BRANDING.textSecondary, fontWeight: '500' },
  labelSelected: { color: BRANDING.accentColor, fontWeight: '700' },
});
