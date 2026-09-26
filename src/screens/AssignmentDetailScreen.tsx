import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
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
} from '../database/operations/assignmentOperations';
import { exportAssignmentToExcel } from '../utils/excelService';
import { formatDateToTR } from '../utils/dateUtils';
import { Assignment, AssignmentStudent, AssignmentStatus } from '../types';

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

      {/* Assignment Summary Card */}
      {assignment && (
        <Card style={styles.summaryCard}>
          <View style={styles.datesRow}>
            <View style={styles.dateCol}>
              <Text style={styles.dateLabel}>Verilme Tarihi</Text>
              <Text style={styles.dateValue}>{formatDateToTR(assignment.assigned_date)}</Text>
            </View>
            <View style={styles.dateCol}>
              <Text style={styles.dateLabel}>Teslim Tarihi</Text>
              <Text style={[styles.dateValue, { color: Colors.danger }]}>
                {formatDateToTR(assignment.due_date)}
              </Text>
            </View>
          </View>

          {assignment.description ? (
            <Text style={styles.summaryDesc}>{assignment.description}</Text>
          ) : null}

          <View style={styles.statsBar}>
            <View style={styles.statMini}>
              <Text style={styles.statVal}>{assignment.total_students || 0}</Text>
              <Text style={styles.statLbl}>Toplam</Text>
            </View>
            <View style={styles.statMini}>
              <Text style={[styles.statVal, { color: Colors.success }]}>
                {assignment.completed_count || 0}
              </Text>
              <Text style={styles.statLbl}>Yapıldı</Text>
            </View>
            <View style={styles.statMini}>
              <Text style={[styles.statVal, { color: Colors.danger }]}>
                {assignment.missing_count || 0}
              </Text>
              <Text style={styles.statLbl}>Yapılmadı</Text>
            </View>
            <View style={styles.statMini}>
              <Text style={[styles.statVal, { color: Colors.info }]}>
                {assignment.pending_count || 0}
              </Text>
              <Text style={styles.statLbl}>Bekliyor</Text>
            </View>
          </View>
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
          style={{ height: 38 }}
        />
      </View>

      {/* Students list */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isExempt = item.is_exempt === 1;

          return (
            <Card style={[styles.studentCard, isExempt && styles.studentCardExempt]}>
              <View style={styles.studentTopRow}>
                <View style={styles.noCircle}>
                  <Text style={styles.noText}>{item.student_number || '-'}</Text>
                </View>
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
    margin: 16,
    marginBottom: 8,
    padding: 14,
  },
  datesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dateCol: {},
  dateLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  dateValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  summaryDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 10,
    lineHeight: 18,
  },
  statsBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    gap: 8,
  },
  statMini: {
    flex: 1,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statLbl: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
  },
  studentCard: {
    padding: 12,
    marginBottom: 8,
  },
  studentCardExempt: {
    backgroundColor: Colors.cardSubtle,
    opacity: 0.85,
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
});
