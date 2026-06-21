import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
  StyleSheet, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore, CCTicket, TicketSeverity, TicketStatus } from '@/store/appStore';
import { BRANDING } from '@/constants/persona';
import { EPIC_MODULES } from '@/constants/modules';

type Props = NativeStackScreenProps<RootStackParamList, 'TicketTracker'>;

const SEVERITY_COLOR: Record<TicketSeverity, string> = {
  critical: '#FF3B5C',
  high: '#FF8C00',
  medium: '#FFB800',
  low: '#00E096',
};

const STATUS_COLOR: Record<TicketStatus, string> = {
  open: '#FF3B5C',
  'in-progress': '#FFB800',
  resolved: '#00E096',
  closed: '#8A8AA0',
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: '🔴 Open',
  'in-progress': '🟡 In Progress',
  resolved: '✅ Resolved',
  closed: '⬛ Closed',
};

const STATUS_FILTERS: { key: TicketStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
];

export default function TicketTrackerScreen({ navigation }: Props) {
  const { tickets, addTicket, updateTicket, addTicketUpdate, deleteTicket, consultantProfile } = useAppStore();
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<CCTicket | null>(null);
  const [updateNote, setUpdateNote] = useState('');

  // New ticket form state
  const [form, setForm] = useState({
    ticketNumber: '',
    title: '',
    description: '',
    module: '',
    department: '',
    severity: 'medium' as TicketSeverity,
    assignedAnalyst: '',
  });

  const filtered = statusFilter === 'all'
    ? tickets
    : tickets.filter((t) => t.status === statusFilter);

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const inProgressCount = tickets.filter((t) => t.status === 'in-progress').length;

  const handleCreate = () => {
    if (!form.title.trim()) return Alert.alert('Required', 'Please enter an issue title.');
    const ticket: CCTicket = {
      id: `tkt_${Date.now()}`,
      ticketNumber: form.ticketNumber.trim(),
      title: form.title.trim(),
      description: form.description.trim(),
      module: form.module,
      department: form.department.trim(),
      severity: form.severity,
      status: 'open',
      assignedAnalyst: form.assignedAnalyst.trim(),
      updates: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      resolvedAt: null,
    };
    addTicket(ticket);
    setShowNewModal(false);
    setForm({ ticketNumber: '', title: '', description: '', module: '', department: '', severity: 'medium', assignedAnalyst: '' });
  };

  const handleStatusChange = (ticket: CCTicket, status: TicketStatus) => {
    updateTicket(ticket.id, {
      status,
      resolvedAt: status === 'resolved' || status === 'closed' ? Date.now() : null,
    });
    setSelectedTicket((prev) => prev ? { ...prev, status, updatedAt: Date.now() } : null);
  };

  const handleAddUpdate = () => {
    if (!updateNote.trim() || !selectedTicket) return;
    addTicketUpdate(selectedTicket.id, updateNote.trim(), consultantProfile?.name ?? 'You');
    setUpdateNote('');
    // Refresh selected ticket from store
    const updated = useAppStore.getState().tickets.find((t) => t.id === selectedTicket.id);
    if (updated) setSelectedTicket({ ...updated });
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Ticket', 'Remove this ticket from tracking?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => { deleteTicket(id); setSelectedTicket(null); },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>CC Tickets</Text>
          <Text style={styles.headerSub}>Command Center Tracker</Text>
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={() => setShowNewModal(true)}>
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: '#FF3B5C' }]}>{openCount}</Text>
          <Text style={styles.summaryLabel}>Open</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: '#FFB800' }]}>{inProgressCount}</Text>
          <Text style={styles.summaryLabel}>In Progress</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: '#00E096' }]}>
            {tickets.filter((t) => t.status === 'resolved').length}
          </Text>
          <Text style={styles.summaryLabel}>Resolved</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: BRANDING.accentColor }]}>{tickets.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
      </View>

      {/* Status filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
            onPress={() => setStatusFilter(f.key)}
          >
            <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Ticket list */}
      <FlatList
        data={filtered}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎫</Text>
            <Text style={styles.emptyTitle}>No tickets yet</Text>
            <Text style={styles.emptySub}>Tap + New to log a command center ticket.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.ticketCard, { borderLeftColor: SEVERITY_COLOR[item.severity] }]} onPress={() => setSelectedTicket(item)}>
            <View style={styles.ticketTop}>
              <View style={{ flex: 1 }}>
                {item.ticketNumber ? (
                  <Text style={styles.ticketNumber}>#{item.ticketNumber}</Text>
                ) : null}
                <Text style={styles.ticketTitle}>{item.title}</Text>
              </View>
              <View style={styles.ticketBadge}>
                <Text style={[styles.ticketStatusText, { color: STATUS_COLOR[item.status] }]}>
                  {STATUS_LABEL[item.status]}
                </Text>
              </View>
            </View>
            <View style={styles.ticketMeta}>
              {item.module ? <Text style={styles.metaChip}>{item.module}</Text> : null}
              {item.department ? <Text style={styles.metaChipMuted}>📍 {item.department}</Text> : null}
              {item.assignedAnalyst ? <Text style={styles.metaChipMuted}>👤 {item.assignedAnalyst}</Text> : null}
            </View>
            <View style={styles.ticketFooter}>
              <Text style={[styles.severityLabel, { color: SEVERITY_COLOR[item.severity] }]}>
                ● {item.severity.toUpperCase()}
              </Text>
              <Text style={styles.timeLabel}>{new Date(item.createdAt).toLocaleString()}</Text>
              {item.updates.length > 0 && (
                <Text style={styles.updatesBadge}>{item.updates.length} update{item.updates.length > 1 ? 's' : ''}</Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      />

      {/* ── NEW TICKET MODAL ── */}
      <Modal visible={showNewModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🎫 Log CC Ticket</Text>
              <TouchableOpacity onPress={() => setShowNewModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>TICKET # (optional)</Text>
              <TextInput style={styles.input} placeholder="e.g. INC-00482" placeholderTextColor={BRANDING.textSecondary}
                value={form.ticketNumber} onChangeText={(v) => setForm({ ...form, ticketNumber: v })} />

              <Text style={styles.fieldLabel}>ISSUE TITLE *</Text>
              <TextInput style={styles.input} placeholder="Brief description of the issue"
                placeholderTextColor={BRANDING.textSecondary} value={form.title}
                onChangeText={(v) => setForm({ ...form, title: v })} />

              <Text style={styles.fieldLabel}>DETAILS</Text>
              <TextInput style={[styles.input, styles.textarea]} placeholder="What happened? Steps to reproduce, error messages..."
                placeholderTextColor={BRANDING.textSecondary} value={form.description}
                onChangeText={(v) => setForm({ ...form, description: v })} multiline />

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>MODULE</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {['', ...EPIC_MODULES.map((m) => m.name)].map((mod) => (
                        <TouchableOpacity key={mod || 'gen'} onPress={() => setForm({ ...form, module: mod })}
                          style={[styles.miniChip, form.module === mod && styles.miniChipActive]}>
                          <Text style={[styles.miniChipText, form.module === mod && styles.miniChipTextActive]}>
                            {mod || 'General'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </View>

              <Text style={styles.fieldLabel}>DEPARTMENT</Text>
              <TextInput style={styles.input} placeholder="e.g. ICU, ED, Pharmacy"
                placeholderTextColor={BRANDING.textSecondary} value={form.department}
                onChangeText={(v) => setForm({ ...form, department: v })} />

              <Text style={styles.fieldLabel}>SEVERITY</Text>
              <View style={styles.severityRow}>
                {(['low', 'medium', 'high', 'critical'] as TicketSeverity[]).map((sev) => (
                  <TouchableOpacity key={sev} onPress={() => setForm({ ...form, severity: sev })}
                    style={[styles.sevChip, form.severity === sev && { backgroundColor: SEVERITY_COLOR[sev] + '30', borderColor: SEVERITY_COLOR[sev] }]}>
                    <Text style={[styles.sevChipText, form.severity === sev && { color: SEVERITY_COLOR[sev], fontWeight: '800' }]}>
                      {sev.charAt(0).toUpperCase() + sev.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>ASSIGNED ANALYST</Text>
              <TextInput style={styles.input} placeholder="Who at the command center picked this up?"
                placeholderTextColor={BRANDING.textSecondary} value={form.assignedAnalyst}
                onChangeText={(v) => setForm({ ...form, assignedAnalyst: v })} />

              <TouchableOpacity style={styles.submitBtn} onPress={handleCreate}>
                <Text style={styles.submitBtnText}>🎫 LOG TICKET</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── TICKET DETAIL MODAL ── */}
      <Modal visible={!!selectedTicket} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            {selectedTicket && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    {selectedTicket.ticketNumber ? (
                      <Text style={styles.ticketNumber}>#{selectedTicket.ticketNumber}</Text>
                    ) : null}
                    <Text style={styles.modalTitle} numberOfLines={2}>{selectedTicket.title}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedTicket(null)}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {selectedTicket.description ? (
                    <Text style={styles.detailDesc}>{selectedTicket.description}</Text>
                  ) : null}

                  <View style={styles.detailMetaRow}>
                    {selectedTicket.module ? <Text style={styles.metaChip}>{selectedTicket.module}</Text> : null}
                    {selectedTicket.department ? <Text style={styles.metaChipMuted}>📍 {selectedTicket.department}</Text> : null}
                    <Text style={[styles.metaChip, { borderColor: SEVERITY_COLOR[selectedTicket.severity], color: SEVERITY_COLOR[selectedTicket.severity] }]}>
                      ● {selectedTicket.severity.toUpperCase()}
                    </Text>
                  </View>

                  {selectedTicket.assignedAnalyst ? (
                    <Text style={styles.analystLabel}>👤 Analyst: {selectedTicket.assignedAnalyst}</Text>
                  ) : null}

                  {/* Status change */}
                  <Text style={[styles.fieldLabel, { marginTop: 16 }]}>UPDATE STATUS</Text>
                  <View style={styles.statusRow}>
                    {(['open', 'in-progress', 'resolved', 'closed'] as TicketStatus[]).map((s) => (
                      <TouchableOpacity key={s} onPress={() => handleStatusChange(selectedTicket, s)}
                        style={[styles.statusChip, selectedTicket.status === s && { backgroundColor: STATUS_COLOR[s] + '25', borderColor: STATUS_COLOR[s] }]}>
                        <Text style={[styles.statusChipText, selectedTicket.status === s && { color: STATUS_COLOR[s], fontWeight: '800' }]}>
                          {s === 'in-progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Updates timeline */}
                  {selectedTicket.updates.length > 0 && (
                    <>
                      <Text style={[styles.fieldLabel, { marginTop: 16 }]}>UPDATES</Text>
                      {selectedTicket.updates.map((u) => (
                        <View key={u.id} style={styles.updateItem}>
                          <View style={styles.updateDot} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.updateNote}>{u.note}</Text>
                            <Text style={styles.updateMeta}>{u.author} · {new Date(u.timestamp).toLocaleString()}</Text>
                          </View>
                        </View>
                      ))}
                    </>
                  )}

                  {/* Add update */}
                  <Text style={[styles.fieldLabel, { marginTop: 16 }]}>ADD UPDATE</Text>
                  <View style={styles.updateInputRow}>
                    <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      placeholder="What's the latest from command center?"
                      placeholderTextColor={BRANDING.textSecondary}
                      value={updateNote} onChangeText={setUpdateNote} multiline />
                    <TouchableOpacity style={styles.sendUpdateBtn} onPress={handleAddUpdate}>
                      <Text style={styles.sendUpdateText}>→</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Delete */}
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(selectedTicket.id)}>
                    <Text style={styles.deleteBtnText}>🗑 Delete Ticket</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRANDING.bgColor },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BRANDING.borderColor },
  backBtn: { paddingRight: 4 },
  backBtnText: { fontSize: 14, color: BRANDING.accentColor, fontWeight: '600' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: BRANDING.accentColor, letterSpacing: 2 },
  headerSub: { fontSize: 10, color: BRANDING.textSecondary, letterSpacing: 1.5, textTransform: 'uppercase' },
  newBtn: { backgroundColor: BRANDING.accentColor, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  newBtnText: { color: '#000', fontWeight: '800', fontSize: 13 },

  summaryBar: { flexDirection: 'row', backgroundColor: BRANDING.cardColor, borderBottomWidth: 1, borderBottomColor: BRANDING.borderColor },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  summaryCount: { fontSize: 22, fontWeight: '900' },
  summaryLabel: { fontSize: 10, color: BRANDING.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: BRANDING.borderColor, marginVertical: 8 },

  filterRow: { maxHeight: 48, paddingVertical: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: BRANDING.cardColor, borderWidth: 1, borderColor: BRANDING.borderColor },
  filterChipActive: { borderColor: BRANDING.accentColor, backgroundColor: 'rgba(0,229,255,0.1)' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: BRANDING.textSecondary },
  filterChipTextActive: { color: BRANDING.accentColor },

  list: { padding: 16, gap: 10, paddingBottom: 40 },
  ticketCard: { backgroundColor: BRANDING.cardColor, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BRANDING.borderColor, borderLeftWidth: 4 },
  ticketTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  ticketNumber: { fontSize: 10, color: BRANDING.accentColor, fontWeight: '800', letterSpacing: 1, marginBottom: 2 },
  ticketTitle: { fontSize: 14, fontWeight: '700', color: BRANDING.textPrimary, lineHeight: 20 },
  ticketBadge: { alignItems: 'flex-end' },
  ticketStatusText: { fontSize: 11, fontWeight: '700' },
  ticketMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  metaChip: { fontSize: 11, fontWeight: '700', color: BRANDING.accentColor, borderWidth: 1, borderColor: BRANDING.accentColor, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  metaChipMuted: { fontSize: 11, color: BRANDING.textSecondary },
  ticketFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  severityLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  timeLabel: { fontSize: 10, color: BRANDING.textSecondary, flex: 1 },
  updatesBadge: { fontSize: 10, color: BRANDING.warningColor, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: BRANDING.textPrimary },
  emptySub: { fontSize: 13, color: BRANDING.textSecondary, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modal: { backgroundColor: BRANDING.cardColor, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '92%', paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: BRANDING.textPrimary },
  modalClose: { fontSize: 20, color: BRANDING.textSecondary, paddingLeft: 8 },

  fieldLabel: { fontSize: 10, fontWeight: '800', color: BRANDING.accentColor, letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: '#0d0d16', borderWidth: 1, borderColor: BRANDING.borderColor, borderRadius: 10, padding: 12, color: BRANDING.textPrimary, fontSize: 14, marginBottom: 14 },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },

  miniChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: BRANDING.borderColor, backgroundColor: BRANDING.bgColor },
  miniChipActive: { borderColor: BRANDING.accentColor, backgroundColor: 'rgba(0,229,255,0.1)' },
  miniChipText: { fontSize: 11, color: BRANDING.textSecondary, fontWeight: '600' },
  miniChipTextActive: { color: BRANDING.accentColor },

  severityRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  sevChip: { flex: 1, alignItems: 'center', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: BRANDING.borderColor },
  sevChipText: { fontSize: 12, color: BRANDING.textSecondary, fontWeight: '600' },

  submitBtn: { backgroundColor: BRANDING.accentColor, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: '#000', fontWeight: '900', fontSize: 15, letterSpacing: 1.5 },

  detailDesc: { fontSize: 14, color: BRANDING.textSecondary, lineHeight: 20, marginBottom: 12 },
  detailMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  analystLabel: { fontSize: 13, color: BRANDING.textSecondary, marginBottom: 4 },

  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  statusChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: BRANDING.borderColor },
  statusChipText: { fontSize: 12, color: BRANDING.textSecondary, fontWeight: '600' },

  updateItem: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  updateDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BRANDING.accentColor, marginTop: 6 },
  updateNote: { fontSize: 13, color: BRANDING.textPrimary, lineHeight: 19 },
  updateMeta: { fontSize: 11, color: BRANDING.textSecondary, marginTop: 2 },

  updateInputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 20 },
  sendUpdateBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: BRANDING.accentColor, alignItems: 'center', justifyContent: 'center' },
  sendUpdateText: { color: '#000', fontWeight: '900', fontSize: 20 },

  deleteBtn: { alignItems: 'center', padding: 14 },
  deleteBtnText: { fontSize: 13, color: BRANDING.dangerColor, fontWeight: '600' },
});
