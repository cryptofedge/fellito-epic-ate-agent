import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore, OrientationDoc } from '@/store/appStore';
import { BRANDING } from '@/constants/persona';
import { ragService } from '@/services/ragService';
import { scanForPhi, logPhiWarningShown } from '@/services/phiGuard';
import PhiWarningModal from '@/components/PhiWarningModal';

type Props = NativeStackScreenProps<RootStackParamList, 'OrientationUpload'>;

export default function OrientationUploadScreen({ navigation }: Props) {
  const { activeSession, orientationDocs, addOrientationDoc } = useAppStore();
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ uri: string; name: string } | null>(null);
  const [showPhiWarning, setShowPhiWarning] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const sessionId = activeSession?.id ?? 'standby';

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      // We can only scan text-based files — PDFs get parsed server-side
      // For text files, do a quick client-side PHI scan on the filename as a heuristic
      const phiScan = scanForPhi(asset.name ?? '');
      if (phiScan.hasPotentialPhi) {
        setPendingFile({ uri: asset.uri, name: asset.name ?? 'document' });
        setShowPhiWarning(true);
        return;
      }

      await uploadFile(asset.uri, asset.name ?? 'document');
    } catch (err) {
      setUploadError('Could not pick document. Try again.');
    }
  };

  const uploadFile = async (uri: string, name: string) => {
    setIsUploading(true);
    setUploadError('');
    try {
      const { docId, chunkCount } = await ragService.ingestDocument(uri, name, sessionId);

      const doc: OrientationDoc = {
        id: docId,
        filename: name,
        uploadedAt: Date.now(),
        chunkCount,
        phiWarningShown: showPhiWarning,
        phiWarningConfirmed: showPhiWarning,
      };
      addOrientationDoc(doc);
    } catch (err: any) {
      setUploadError(err.message ?? 'Upload failed. Check your connection and try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePhiConfirm = async () => {
    logPhiWarningShown('upload', true);
    setShowPhiWarning(false);
    if (pendingFile) {
      await uploadFile(pendingFile.uri, pendingFile.name);
      setPendingFile(null);
    }
  };

  const handlePhiCancel = () => {
    logPhiWarningShown('upload', false);
    setShowPhiWarning(false);
    setPendingFile(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Orientation Docs</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.description}>
          Upload your client's Go-Live orientation materials — tip sheets, workflow guides,
          department build docs. Fellito ingests them immediately and uses them as his primary
          source during the Go-Live.
        </Text>

        <View style={styles.phiNote}>
          <Text style={styles.phiNoteIcon}>🔒</Text>
          <Text style={styles.phiNoteText}>
            Upload department workflow content only. No patient records, charts, or PHI.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.uploadBtn, isUploading && styles.uploadBtnDisabled]}
          onPress={pickDocument}
          disabled={isUploading}
        >
          {isUploading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.uploadBtnText}>+ ADD DOCUMENT</Text>
          )}
        </TouchableOpacity>

        {uploadError ? (
          <Text style={styles.errorText}>{uploadError}</Text>
        ) : null}

        <Text style={styles.docsLabel}>
          INGESTED DOCS ({orientationDocs.length})
        </Text>

        <FlatList
          data={orientationDocs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DocRow doc={item} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No docs uploaded yet. Drop your Go-Live orientation materials here before
              or during the event.
            </Text>
          }
          scrollEnabled={false}
        />
      </View>

      <PhiWarningModal
        visible={showPhiWarning}
        onConfirm={handlePhiConfirm}
        onCancel={handlePhiCancel}
      />
    </SafeAreaView>
  );
}

function DocRow({ doc }: { doc: OrientationDoc }) {
  return (
    <View style={styles.docRow}>
      <View style={styles.docIcon}>
        <Text style={styles.docIconText}>📄</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.docName} numberOfLines={1}>{doc.filename}</Text>
        <Text style={styles.docMeta}>
          {doc.chunkCount} chunks indexed · {new Date(doc.uploadedAt).toLocaleTimeString()}
        </Text>
      </View>
      <View style={styles.readyBadge}>
        <Text style={styles.readyText}>READY</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRANDING.bgColor },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BRANDING.borderColor,
    gap: 12,
  },
  backBtn: { padding: 4 },
  backText: { color: BRANDING.accentColor, fontSize: 15, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: BRANDING.textPrimary },
  content: { padding: 20 },
  description: { fontSize: 14, color: BRANDING.textSecondary, lineHeight: 20, marginBottom: 16 },
  phiNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#1A1A0A', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: BRANDING.warningColor, marginBottom: 20,
  },
  phiNoteIcon: { fontSize: 16 },
  phiNoteText: { flex: 1, fontSize: 13, color: BRANDING.warningColor, lineHeight: 18 },
  uploadBtn: {
    backgroundColor: BRANDING.accentColor, borderRadius: 12,
    padding: 16, alignItems: 'center', marginBottom: 12,
  },
  uploadBtnDisabled: { opacity: 0.5 },
  uploadBtnText: { color: '#000', fontWeight: '900', fontSize: 15, letterSpacing: 2 },
  errorText: { color: BRANDING.dangerColor, fontSize: 13, marginBottom: 12 },
  docsLabel: {
    fontSize: 10, fontWeight: '700', color: BRANDING.accentColor,
    letterSpacing: 2, marginBottom: 12, marginTop: 8,
  },
  docRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: BRANDING.cardColor, borderRadius: 10,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: BRANDING.borderColor,
  },
  docIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#1a1a2a', alignItems: 'center', justifyContent: 'center' },
  docIconText: { fontSize: 18 },
  docName: { fontSize: 14, fontWeight: '600', color: BRANDING.textPrimary },
  docMeta: { fontSize: 11, color: BRANDING.textSecondary, marginTop: 2 },
  readyBadge: {
    backgroundColor: '#0A2A1A', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: BRANDING.successColor,
  },
  readyText: { fontSize: 10, fontWeight: '800', color: BRANDING.successColor, letterSpacing: 1 },
  emptyText: { fontSize: 13, color: BRANDING.textSecondary, lineHeight: 20, marginTop: 8 },
});
