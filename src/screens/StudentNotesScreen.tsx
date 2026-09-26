import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { EmptyState } from '../components/EmptyState';
import { getClasses } from '../database/operations/classOperations';
import { getStudentsByClass } from '../database/operations/studentOperations';
import {
  getNotesByStudent,
  getNotesByClass,
  createNote,
  deleteNote,
  updateNote,
} from '../database/operations/noteOperations';
import { exportStudentNotesToExcel } from '../utils/excelService';
import { formatDateToTR, getCurrentDateTimeString } from '../utils/dateUtils';
import { ClassItem, Student, StudentNote } from '../types';

const QUICK_TAGS = [
  'Derste çok aktifti 👍',
  'Ödevini getirmedi ❌',
  'Derste konuştu / dikkati dağınıktı ⚠️',
  'Soruları doğru çözdü ⭐',
  'Dersi dikkatle dinledi 📖',
  'Rehberlik görüşmesi yapıldı 💬',
  'Söz hakkı aldı ve katkı sağladı 👏',
];

export const StudentNotesScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State for student opinion
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [studentHistory, setStudentHistory] = useState<StudentNote[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);

  const loadClasses = async () => {
    try {
      const cls = await getClasses();
      setClasses(cls);
      const initialClassId = route.params?.initialClassId;
      if (initialClassId && cls.some((c) => c.id === initialClassId)) {
        handleSelectClass(initialClassId);
      } else if (cls.length > 0 && !selectedClassId) {
        handleSelectClass(cls[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadClasses();
    }, [])
  );

  const handleSelectClass = async (classId: number) => {
    setSelectedClassId(classId);
    try {
      const studs = await getStudentsByClass(classId);
      setStudents(studs);

      // If initialStudentId was passed in route params
      const initialStudentId = route.params?.initialStudentId;
      if (initialStudentId) {
        const found = studs.find((s) => s.id === initialStudentId);
        if (found) {
          handleOpenStudentModal(found);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenStudentModal = async (student: Student) => {
    setSelectedStudent(student);
    setNoteInput('');
    setEditingNoteId(null);
    try {
      const history = await getNotesByStudent(student.id);
      setStudentHistory(history);
      setModalVisible(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveNote = async () => {
    if (!selectedStudent || !selectedClassId) return;
    if (!noteInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen öğrenci ile ilgili görüşünüzü yazınız.');
      return;
    }

    try {
      if (editingNoteId) {
        await updateNote(editingNoteId, noteInput.trim());
      } else {
        await createNote(
          selectedStudent.id,
          selectedClassId,
          noteInput.trim(),
          getCurrentDateTimeString()
        );
      }
      setNoteInput('');
      setEditingNoteId(null);
      // Reload history
      const updatedHistory = await getNotesByStudent(selectedStudent.id);
      setStudentHistory(updatedHistory);
    } catch (e) {
      Alert.alert('Hata', 'Görüş kaydedilemedi.');
    }
  };

  const handleDeleteHistoryItem = (item: StudentNote) => {
    Alert.alert('Görüşü Sil', 'Bu görüş kaydını silmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteNote(item.id);
            if (selectedStudent) {
              const updatedHistory = await getNotesByStudent(selectedStudent.id);
              setStudentHistory(updatedHistory);
            }
          } catch (e) {
            Alert.alert('Hata', 'Kayıt silinemedi.');
          }
        },
      },
    ]);
  };

  const handleEditHistoryItem = (item: StudentNote) => {
    setEditingNoteId(item.id);
    setNoteInput(item.note);
  };

  const handleExportClassNotes = async () => {
    if (!selectedClassId) return;
    try {
      const notes = await getNotesByClass(selectedClassId);
      if (notes.length === 0) {
        Alert.alert('Bilgi', 'Bu şubede henüz kayıtlı görüş bulunmuyor.');
        return;
      }
      await exportStudentNotesToExcel(notes);
    } catch (e) {
      Alert.alert('Hata', 'Excel raporu oluşturulamadı.');
    }
  };

  const filteredStudents = students.filter((s) => {
    const term = searchQuery.toLowerCase();
    const name = `${s.first_name} ${s.last_name}`.toLowerCase();
    const no = (s.student_number || '').toLowerCase();
    return name.includes(term) || no.includes(term);
  });

  const selectedClassName = classes.find((c) => c.id === selectedClassId)?.name || 'Şube';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Öğrenci Görüş Modülü</Text>
          <Text style={styles.headerSub}>Tarih & saat bilgisiyle anlık görüş kaydı</Text>
        </View>
        <TouchableOpacity
          style={styles.exportBtn}
          onPress={handleExportClassNotes}
          activeOpacity={0.7}
        >
          <Ionicons name="share-outline" size={18} color={Colors.primary} />
          <Text style={styles.exportBtnText}>Excel</Text>
        </TouchableOpacity>
      </View>

      {/* Class Horizontal Selector */}
      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
          {classes.map((c) => {
            const isSelected = selectedClassId === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => handleSelectClass(c.id)}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                  {c.name}
                </Text>
                <Text style={[styles.chipSub, isSelected && styles.chipSubActive]}>
                  ({c.student_count || 0})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Search Input */}
      <View style={styles.searchWrap}>
        <Input
          placeholder="Öğrenci ara (Ad, Soyad veya No)..."
          icon="search"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onClear={() => setSearchQuery('')}
          style={{ height: 38 }}
        />
      </View>

      {/* Students List */}
      <FlatList
        data={filteredStudents}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title="Öğrenci Bulunamadı"
            description={
              classes.length === 0
                ? 'Görüş kaydı yapmak için önce bir şube ve öğrenci ekleyin.'
                : 'Bu şubede henüz öğrenci bulunmuyor.'
            }
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handleOpenStudentModal(item)}
          >
            <Card style={styles.studentCard}>
              <View style={styles.studentRow}>
                <View style={styles.noCircle}>
                  <Text style={styles.noText}>{item.student_number || '-'}</Text>
                </View>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>
                    {item.first_name} {item.last_name}
                  </Text>
                  <Text style={styles.clickHint}>Görüş yazmak için tıklayın</Text>
                </View>
                <View style={styles.iconCircle}>
                  <Ionicons name="chatbox-ellipses" size={20} color={Colors.primary} />
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />

      {/* Student Opinion Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {selectedStudent?.first_name} {selectedStudent?.last_name}
                </Text>
                <Text style={styles.modalSub}>
                  No: {selectedStudent?.student_number} • Şube: {selectedClassName}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
              {/* Quick Preset Tags */}
              <Text style={styles.presetLabel}>Hızlı Görüş Şablonları:</Text>
              <View style={styles.tagsGrid}>
                {QUICK_TAGS.map((tag, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.tagBtn}
                    onPress={() => {
                      setNoteInput((prev) => (prev ? `${prev}, ${tag}` : tag));
                    }}
                  >
                    <Text style={styles.tagText}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Note Input */}
              <Input
                label={
                  editingNoteId
                    ? 'Görüşü Düzenle'
                    : `Öğrenci Görüşü (${getCurrentDateTimeString()})`
                }
                placeholder="Örn: Bu derste derse çok ilgiliydi veya yaramazlık yaptı..."
                value={noteInput}
                onChangeText={setNoteInput}
                multiline
                numberOfLines={3}
                style={{ minHeight: 70 }}
              />

              <View style={styles.saveBtnRow}>
                {editingNoteId && (
                  <Button
                    title="İptal"
                    variant="outline"
                    size="sm"
                    onPress={() => {
                      setEditingNoteId(null);
                      setNoteInput('');
                    }}
                    style={{ flex: 1, marginRight: 8 }}
                  />
                )}
                <Button
                  title={editingNoteId ? 'Güncelle' : 'Görüşü Kaydet'}
                  icon="checkmark"
                  size="sm"
                  onPress={handleSaveNote}
                  style={{ flex: 2 }}
                />
              </View>

              {/* Past History */}
              <View style={styles.historySection}>
                <Text style={styles.historyTitle}>
                  Geçmiş Görüşler ({studentHistory.length})
                </Text>

                {studentHistory.length === 0 ? (
                  <Text style={styles.emptyHistoryText}>
                    Bu öğrenci için henüz kaydedilmiş bir görüş bulunmuyor.
                  </Text>
                ) : (
                  studentHistory.map((item) => (
                    <Card key={item.id} style={styles.historyCard}>
                      <View style={styles.historyTopRow}>
                        <View style={styles.historyDateBadge}>
                          <Ionicons name="time-outline" size={12} color={Colors.primary} />
                          <Text style={styles.historyDateText}>
                            {formatDateToTR(item.note_date)}
                          </Text>
                        </View>

                        <View style={styles.historyActions}>
                          <TouchableOpacity
                            onPress={() => handleEditHistoryItem(item)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="pencil" size={16} color={Colors.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteHistoryItem(item)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <Text style={styles.historyContentText}>{item.note}</Text>
                    </Card>
                  ))
                )}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  exportBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  chipsWrap: {
    backgroundColor: Colors.card,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  chipTextActive: {
    color: Colors.textInverse,
  },
  chipSub: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  chipSubActive: {
    color: Colors.primaryLight,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
  },
  studentCard: {
    padding: 14,
    marginBottom: 8,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noCircle: {
    minWidth: 40,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    paddingHorizontal: 4,
  },
  noText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  clickHint: {
    fontSize: 12,
    color: Colors.primary,
    marginTop: 2,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  modalSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modalScroll: {
    marginBottom: 20,
  },
  presetLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  tagBtn: {
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    color: Colors.textPrimary,
  },
  saveBtnRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  historySection: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 14,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  emptyHistoryText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  historyCard: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: Colors.cardSubtle,
  },
  historyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  historyActions: {
    flexDirection: 'row',
    gap: 12,
  },
  historyContentText: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 19,
  },
});
