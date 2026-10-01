import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  Image,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import {
  getAssignmentById,
  getAssignmentStudents,
  updateAssignmentStudentStatus,
  bulkUpdateAssignmentStudents,
} from '../database/operations/assignmentOperations';
import { exportAssignmentToExcel } from '../utils/excelService';
import { formatDateToTR } from '../utils/dateUtils';
import { Assignment, AssignmentStudent, AssignmentStatus } from '../types';

const statusLabels: Record<AssignmentStatus, string> = {
  yapildi: 'Yapıldı',
  yapilmadi: 'Yapılmadı',
  eksik: 'Eksik',
  bekliyor: 'Bekliyor',
  muaf: 'Muaf',
};

export const AssignmentDetailScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { assignmentId } = route.params;

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [students, setStudents] = useState<AssignmentStudent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Note modal state
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [selectedStudentItem, setSelectedStudentItem] = useState<AssignmentStudent | null>(null);
  const [noteInput, setNoteInput] = useState('');

  const loadData = async () => {
    try {
      const asg = await getAssignmentById(assignmentId);
      setAssignment(asg);
      const studs = await getAssignmentStudents(assignmentId);
      setStudents(studs);
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [assignmentId])
  );

  const handleUpdateStatus = async (item: AssignmentStudent, newStatus: AssignmentStatus) => {
    try {
      // Optimistic update
      setStudents((prev) =>
        prev.map((s) => (s.id === item.id ? { ...s, status: newStatus } : s))
      );
      await updateAssignmentStudentStatus(item.id, newStatus, item.note);
      // Reload assignment stats
      const asg = await getAssignmentById(assignmentId);
      setAssignment(asg);
    } catch (e) {
      Alert.alert('Hata', 'Durum güncellenirken hata oluştu.');
      loadData();
    }
  };

  const handleBulkUpdateStatus = (newStatus: AssignmentStatus) => {
    const isFiltered = searchQuery.trim().length > 0;
    const targetStudents = (isFiltered ? filtered : students).filter(
      (s) => s.is_exempt === 0
    );

    if (targetStudents.length === 0) {
      Alert.alert('Bilgi', 'İşlem yapılacak (muaf olmayan) öğrenci bulunamadı.');
      return;
    }

    const label = statusLabels[newStatus] || newStatus;
    const message = isFiltered
      ? `Filtrelenen ${targetStudents.length} öğrencinin ödev durumu "${label}" olarak güncellensin mi?`
      : `Muaf olmayan tüm (${targetStudents.length}) öğrencilerin ödev durumu "${label}" olarak güncellensin mi?`;

    Alert.alert('Toplu Durum Atama', message, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Evet, Güncelle',
        style: newStatus === 'yapilmadi' ? 'destructive' : 'default',
        onPress: async () => {
          try {
            const targetIds = targetStudents.map((s) => s.id);
            setStudents((prev) =>
              prev.map((s) =>
                targetIds.includes(s.id) ? { ...s, status: newStatus } : s
              )
            );
            await bulkUpdateAssignmentStudents(assignmentId, newStatus, targetIds);
            const asg = await getAssignmentById(assignmentId);
            setAssignment(asg);
          } catch (e) {
            Alert.alert('Hata', 'Toplu durum güncellenirken hata oluştu.');
            loadData();
          }
        },
      },
    ]);
  };

  const handleOpenNote = (item: AssignmentStudent) => {
    setSelectedStudentItem(item);
    setNoteInput(item.note || '');
    setNoteModalVisible(true);
  };

  const handleSaveNote = async () => {
    if (!selectedStudentItem) return;
    try {
      await updateAssignmentStudentStatus(
        selectedStudentItem.id,
        selectedStudentItem.status,
        noteInput.trim()
      );
      setNoteModalVisible(false);
      loadData();
    } catch (e) {
      Alert.alert('Hata', 'Not kaydedilemedi.');
    }
  };

  const handleExportExcel = async () => {
    if (!assignment) return;
    try {
      await exportAssignmentToExcel(assignment, students);
    } catch (e) {
      Alert.alert('Hata', 'Excel dosyası oluşturulamadı.');
    }
  };

  const filtered = students.filter((s) => {
    const term = searchQuery.toLowerCase();
    const name = `${s.first_name} ${s.last_name}`.toLowerCase();
    const no = (s.student_number || '').toLowerCase();
    return name.includes(term) || no.includes(term);
  });

  return (
    <View style={styles.container}>
      <Header
        title={assignment?.title || 'Ödev Detayı'}
        subtitle={assignment?.class_name ? `Şube: ${assignment.class_name}` : ''}
        showBack
        onBack={() => navigation.goBack()}
        rightAction={{
          icon: 'share-outline',
          label: 'Excel',
          onPress: handleExportExcel,
        }}
      />

      {/* Students list */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Assignment Summary Card */}
            {assignment && (
              <Card style={styles.summaryCard}>
                <View style={styles.summaryTopRow}>
                  <View style={styles.dateColCompact}>
                    <Text style={styles.dateLabelCompact}>Verilme: <Text style={styles.dateValueCompact}>{formatDateToTR(assignment.assigned_date)}</Text></Text>
                    <Text style={styles.dateLabelCompact}>Teslim: <Text style={[styles.dateValueCompact, { color: Colors.danger }]}>{formatDateToTR(assignment.due_date)}</Text></Text>
                  </View>

                  <View style={styles.statsBarCompact}>
                    <View style={styles.statMiniCompact}>
                      <Text style={styles.statValCompact}>{assignment.total_students || 0}</Text>
                      <Text style={styles.statLblCompact}>Toplam</Text>
                    </View>
                    <View style={styles.statMiniCompact}>
                      <Text style={[styles.statValCompact, { color: Colors.success }]}>
                        {assignment.completed_count || 0}
                      </Text>
                      <Text style={styles.statLblCompact}>Yapıldı</Text>
                    </View>
                    <View style={styles.statMiniCompact}>
                      <Text style={[styles.statValCompact, { color: Colors.danger }]}>
                        {assignment.missing_count || 0}
                      </Text>
                      <Text style={styles.statLblCompact}>Yapılmadı</Text>
                    </View>
                    <View style={styles.statMiniCompact}>
                      <Text style={[styles.statValCompact, { color: Colors.info }]}>
                        {assignment.pending_count || 0}
                      </Text>
                      <Text style={styles.statLblCompact}>Bekliyor</Text>
                    </View>
                  </View>
                </View>

                {assignment.description ? (
                  <Text style={styles.summaryDesc} numberOfLines={1}>{assignment.description}</Text>
                ) : null}
              </Card>
            )}

            {/* Search Input */}
            <View style={styles.searchWrap}>
              <Input
                placeholder="Öğrenci ara..."
                icon="search"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onClear={() => setSearchQuery('')}
                style={{ height: 36 }}
              />
            </View>

            {/* Toplu Durum Atama Butonları */}
            <View style={styles.bulkContainer}>
              <View style={styles.bulkHeader}>
                <Ionicons name="flash-outline" size={13} color={Colors.primary} />
                <Text style={styles.bulkTitle}>Toplu Durum Ata:</Text>
                <Text style={styles.bulkSubtitle}>
                  {searchQuery.trim() ? '(Sadece filtrelenenler)' : '(Muaf olanlar hariç)'}
                </Text>
              </View>

              <View style={styles.bulkGrid}>
                <TouchableOpacity
                  style={[styles.bulkBtn, styles.bulkBtnYapildi]}
                  onPress={() => handleBulkUpdateStatus('yapildi')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="checkmark-circle" size={13} color={Colors.successDark} />
                  <Text style={[styles.bulkBtnText, { color: Colors.successDark }]}>Yapıldı</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.bulkBtn, styles.bulkBtnYapilmadi]}
                  onPress={() => handleBulkUpdateStatus('yapilmadi')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle" size={13} color={Colors.dangerDark} />
                  <Text style={[styles.bulkBtnText, { color: Colors.dangerDark }]}>Yapılmadı</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.bulkBtn, styles.bulkBtnEksik]}
                  onPress={() => handleBulkUpdateStatus('eksik')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="alert-circle" size={13} color={Colors.warningDark} />
                  <Text style={[styles.bulkBtnText, { color: Colors.warningDark }]}>Eksik</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.bulkBtn, styles.bulkBtnBekliyor]}
                  onPress={() => handleBulkUpdateStatus('bekliyor')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="time" size={13} color={Colors.textSecondary} />
                  <Text style={[styles.bulkBtnText, { color: Colors.textSecondary }]}>Bekliyor</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        }
        renderItem={({ item }) => {
          const isExempt = item.is_exempt === 1;

          return (
            <Card style={[styles.studentCard, isExempt && styles.studentCardExempt]}>
              <View style={styles.studentTopRow}>
                {item.photo_uri ? (
                  <Image source={{ uri: item.photo_uri }} style={styles.studentThumb} />
                ) : (
                  <View style={styles.noCircle}>
                    <Text style={styles.noText}>{item.student_number || '-'}</Text>
                  </View>
                )}
                <View style={styles.studentNameWrap}>
                  <Text style={styles.studentName}>
                    {item.first_name} {item.last_name}
                  </Text>
                  {item.note ? (
                    <Text style={styles.itemNoteText} numberOfLines={1}>
                      Not: {item.note}
                    </Text>
                  ) : null}
                </View>

                {/* Teacher Note Button */}
                <TouchableOpacity
                  style={[
                    styles.noteBtn,
                    item.note ? { backgroundColor: Colors.warningLight } : null,
                  ]}
                  onPress={() => handleOpenNote(item)}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={16}
                    color={item.note ? Colors.warningDark : Colors.textSecondary}
                  />
                </TouchableOpacity>

                {isExempt ? (
                  <Badge label="Ödevden Muaf" status="muaf" size="sm" />
                ) : (
                  <Badge status={item.status} size="sm" />
                )}
              </View>

              {!isExempt && (
                <View style={styles.statusButtonsRow}>
                  <TouchableOpacity
                    style={[
                      styles.statusSelectBtn,
                      item.status === 'yapildi' && styles.statusBtnYapildi,
                    ]}
                    onPress={() => handleUpdateStatus(item, 'yapildi')}
                  >
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={item.status === 'yapildi' ? '#fff' : Colors.successDark}
                    />
                    <Text
                      style={[
                        styles.statusBtnText,
                        item.status === 'yapildi' && styles.statusBtnTextActive,
                      ]}
                    >
                      Yapıldı
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.statusSelectBtn,
                      item.status === 'yapilmadi' && styles.statusBtnYapilmadi,
                    ]}
                    onPress={() => handleUpdateStatus(item, 'yapilmadi')}
                  >
                    <Ionicons
                      name="close"
                      size={14}
                      color={item.status === 'yapilmadi' ? '#fff' : Colors.dangerDark}
                    />
                    <Text
                      style={[
                        styles.statusBtnText,
                        item.status === 'yapilmadi' && styles.statusBtnTextActive,
                      ]}
                    >
                      Yapılmadı
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.statusSelectBtn,
                      item.status === 'eksik' && styles.statusBtnEksik,
                    ]}
                    onPress={() => handleUpdateStatus(item, 'eksik')}
                  >
                    <Ionicons
                      name="alert"
                      size={14}
                      color={item.status === 'eksik' ? '#fff' : Colors.warningDark}
                    />
                    <Text
                      style={[
                        styles.statusBtnText,
                        item.status === 'eksik' && styles.statusBtnTextActive,
                      ]}
                    >
                      Eksik
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.statusSelectBtn,
                      item.status === 'bekliyor' && styles.statusBtnBekliyor,
                    ]}
                    onPress={() => handleUpdateStatus(item, 'bekliyor')}
                  >
                    <Ionicons
                      name="hourglass-outline"
                      size={14}
                      color={item.status === 'bekliyor' ? '#fff' : Colors.info}
                    />
                    <Text
                      style={[
                        styles.statusBtnText,
                        item.status === 'bekliyor' && styles.statusBtnTextActive,
                      ]}
                    >
                      Bekliyor
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          );
        }}
      />

      {/* Teacher Note on Student Homework Modal */}
      <Modal visible={noteModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Öğrenci Ödev Notu</Text>
              <TouchableOpacity onPress={() => setNoteModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalStudentName}>
              {selectedStudentItem?.first_name} {selectedStudentItem?.last_name} (No:{' '}
              {selectedStudentItem?.student_number})
            </Text>

            <Input
              label="Öğretmen Görüşü / Notu"
              placeholder="Örn: 2 soru çözülmemiş, genel olarak gayet iyi."
              value={noteInput}
              onChangeText={setNoteInput}
              multiline
              numberOfLines={3}
              style={{ minHeight: 70 }}
            />

            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setNoteModalVisible(false)}
              />
              <Button title="Kaydet" style={{ flex: 1 }} onPress={handleSaveNote} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  summaryCard: {
    marginBottom: 6,
    padding: 10,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateColCompact: {
    gap: 2,
  },
  dateLabelCompact: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  dateValueCompact: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  summaryDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  statsBarCompact: {
    flexDirection: 'row',
    gap: 12,
  },
  statMiniCompact: {
    alignItems: 'center',
  },
  statValCompact: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statLblCompact: {
    fontSize: 9,
    color: Colors.textSecondary,
  },
  searchWrap: {
    paddingVertical: 4,
  },
  listContent: {
    padding: 16,
    paddingTop: 12,
  },
  studentCard: {
    padding: 12,
    marginBottom: 8,
  },
  studentCardExempt: {
    backgroundColor: Colors.cardSubtle,
    opacity: 0.85,
  },
  studentThumb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  studentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  noCircle: {
    minWidth: 36,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  studentNameWrap: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  itemNoteText: {
    fontSize: 12,
    color: Colors.primary,
    fontStyle: 'italic',
    marginTop: 1,
  },
  noteBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: Colors.cardSubtle,
    marginRight: 8,
  },
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  statusSelectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: Colors.cardSubtle,
    gap: 3,
  },
  statusBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  statusBtnTextActive: {
    color: '#FFFFFF',
  },
  statusBtnYapildi: {
    backgroundColor: Colors.success,
  },
  statusBtnYapilmadi: {
    backgroundColor: Colors.danger,
  },
  statusBtnEksik: {
    backgroundColor: Colors.warning,
  },
  statusBtnBekliyor: {
    backgroundColor: Colors.info,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalStudentName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  bulkContainer: {
    marginBottom: 8,
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bulkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  bulkTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  bulkSubtitle: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  bulkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  bulkBtn: {
    flex: 1,
    minWidth: '23%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
  },
  bulkBtnYapildi: {
    backgroundColor: Colors.successLight,
    borderColor: '#A7F3D0',
  },
  bulkBtnYapilmadi: {
    backgroundColor: Colors.dangerLight,
    borderColor: '#FECACA',
  },
  bulkBtnEksik: {
    backgroundColor: Colors.warningLight,
    borderColor: '#FDE68A',
  },
  bulkBtnBekliyor: {
    backgroundColor: Colors.cardSubtle,
    borderColor: Colors.border,
  },
  bulkBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
});
