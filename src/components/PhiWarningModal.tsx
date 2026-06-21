import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { BRANDING } from '@/constants/persona';

interface Props {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PhiWarningModal({ visible, onConfirm, onCancel }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Possible Patient Data Detected</Text>
          <Text style={styles.body}>
            This looks like it might contain patient data — Fellito only works with department
            workflow content, not PHI.{'\n\n'}
            If this is a tip sheet, training screenshot, or workflow doc that references example
            MRN/date formats, tap{' '}
            <Text style={styles.bold}>Not PHI — Continue</Text>
            {' '}to proceed.{'\n\n'}
            If this contains real patient information, tap{' '}
            <Text style={styles.bold}>Remove It</Text>
            {' '}and edit before sending.
          </Text>

          <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
            <Text style={styles.confirmText}>Not PHI — Continue</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>Remove It</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modal: {
    backgroundColor: BRANDING.cardColor, borderRadius: 16,
    padding: 24, width: '100%', maxWidth: 400,
    borderWidth: 1, borderColor: BRANDING.warningColor,
  },
  icon: { fontSize: 36, textAlign: 'center', marginBottom: 12 },
  title: {
    fontSize: 18, fontWeight: '800', color: BRANDING.warningColor,
    textAlign: 'center', marginBottom: 16,
  },
  body: {
    fontSize: 14, color: BRANDING.textSecondary, lineHeight: 20,
    marginBottom: 24,
  },
  bold: { fontWeight: '700', color: BRANDING.textPrimary },
  confirmBtn: {
    backgroundColor: BRANDING.accentColor, borderRadius: 10,
    padding: 14, alignItems: 'center', marginBottom: 10,
  },
  confirmText: { color: '#000', fontWeight: '800', fontSize: 15 },
  cancelBtn: {
    borderRadius: 10, padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: BRANDING.dangerColor,
  },
  cancelText: { color: BRANDING.dangerColor, fontWeight: '700', fontSize: 15 },
});
