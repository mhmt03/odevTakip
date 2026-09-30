import React, { useState, useCallback } from 'react';
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
  getQuickNotes,
  addQuickNote,
  updateQuickNote,
  deleteQuickNote,
  resetDefaultQuickNotes,
  QuickNoteItem,
} from '../database/operations/noteOperations';
import { exportStudentNotesToExcel } from '../utils/excelService';
import { formatDateToTR, getCurrentDateTimeString } from '../utils/dateUtils';
import {
  getCurrentActiveLessonSummary,
  CurrentLessonSummary,
} from '../database/operations/scheduleOperations';
import { ClassItem, Student, StudentNote } from '../types';
import { useSchoolTheme } from '../context/SchoolThemeContext';

export const StudentNotesScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { bgTint } = useSchoolTheme();

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Quick preset tags state
  const [quickTags, setQuickTags] = useState<QuickNoteItem[]>([]);
  const [manageModalVisible, setManageModalVisible] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [editingTag, setEditingTag] = useState<QuickNoteItem | null>(null);
  const [editingTagInput, setEditingTagInput] = useState('');

  // Modal State for student opinion
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [studentHistory, setStudentHistory] = useState<StudentNote[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [activeLesson, setActiveLesson] = useState<CurrentLessonSummary | null>(null);

  const loadData = async () => {
    try {
      const cls = await getClasses();
      setClasses(cls);

      const tags = await getQuickNotes();
      setQuickTags(tags);

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
      loadData();
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
      const [history, currentSched] = await Promise.all([
        getNotesByStudent(student.id),
        getCurrentActiveLessonSummary(),
      ]);
      setStudentHistory(history);
      setActiveLesson(currentSched);
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
          undefined,
          activeLesson?.fullText
        );
      }

      setNoteInput('');
      setEditingNoteId(null);

      // Refresh history
      const history = await getNotesByStudent(selectedStudent.id);
      setStudentHistory(history);
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
              const history = await getNotesByStudent(selectedStudent.id);
              setStudentHistory(history);
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

  // Quick Preset Tag Handlers
  const handleAddNewTag = async () => {
    if (!newTagInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen eklenecek görüş metnini giriniz.');
      return;
    }
    try {
      await addQuickNote(newTagInput.trim());
      setNewTagInput('');
      const tags = await getQuickNotes();
      setQuickTags(tags);
    } catch (e) {
      Alert.alert('Hata', 'Şablon eklenemedi.');
    }
  };

  const handleStartEditTag = (tag: QuickNoteItem) => {
    setEditingTag(tag);
    setEditingTagInput(tag.text);
  };

  const handleSaveEditTag = async () => {
    if (!editingTag) return;
    if (!editingTagInput.trim()) {
      Alert.alert('Uyarı', 'Görüş metni boş olamaz.');
      return;
    }
    try {
      await updateQuickNote(editingTag.id, editingTagInput.trim());
      setEditingTag(null);
      setEditingTagInput('');
      const tags = await getQuickNotes();
      setQuickTags(tags);
    } catch (e) {
      Alert.alert('Hata', 'Şablon güncellenemedi.');
    }
  };

  const handleDeleteTag = (tag: QuickNoteItem) => {
    Alert.alert(
      'Şablonu Sil',
      `"${tag.text}" şablonunu silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteQuickNote(tag.id);
              const tags = await getQuickNotes();
              setQuickTags(tags);
            } catch (e) {
              Alert.alert('Hata', 'Şablon silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleResetDefaultTags = () => {
    Alert.alert(
      'Varsayılanlara Sıfırla',
      'Tüm hızlı görüş şablonları başlangıçtaki varsayılan haline döndürülecektir. Onaylıyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sıfırla',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetDefaultQuickNotes();
              const tags = await getQuickNotes();
              setQuickTags(tags);
            } catch (e) {
              Alert.alert('Hata', 'Sıfırlanamadı.');
            }
          },
        },
      ]
    );
  };

  // EXCEL EXPORT
  const handleExportClassNotes = async () => {
    if (!selectedClassId) return;
    try {
      const notes = await getNotesByClass(selectedClassId);
      if (notes.length === 0) {
        Alert.alert('Bilgi', 'Bu şube için henüz kaydedilmiş bir görüş bulunmuyor.');
        return;
      }
      await exportStudentNotesToExcel(notes);
    } catch (e) {
      Alert.alert('Hata', 'Excel çıktısı oluşturulamadı.');
    }
  };

  const filteredStudents = students.filter((s) => {
    const term = searchQuery.toLowerCase();
    const fullName = `${s.first_name} ${s.last_name}`.toLowerCase();
    const no = (s.student_number || '').toLowerCase();
    return fullName.includes(term) || no.includes(term);
  });

  const selectedClassName = classes.find((c) => c.id === selectedClassId)?.name || '';

  return (
    <View style={[styles.container, { backgroundColor: bgTint }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Öğrenci Görüş Modülü</Text>
          <Text style={styles.headerSub}>Tarih & saat bilgisiyle anlık görüş kaydı</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.settingsHeaderBtn}
            onPress={() => setManageModalVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="sparkles" size={15} color={Colors.primary} />
            <Text style={styles.settingsHeaderBtnText}>Hızlı Görüşler</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.exportBtn}
            onPress={handleExportClassNotes}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={16} color={Colors.primary} />
            <Text style={styles.exportBtnText}>Excel</Text>
          </TouchableOpacity>
        </View>
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
              {/* Quick Preset Tags Header with Settings Link */}
              <View style={styles.presetLabelRow}>
                <Text style={styles.presetLabel}>Hızlı Görüş Şablonları:</Text>
                <TouchableOpacity
                  style={styles.editPresetsLink}
                  onPress={() => setManageModalVisible(true)}
                >
                  <Ionicons name="options-outline" size={13} color={Colors.primary} />
                  <Text style={styles.editPresetsLinkText}>Şablonları Düzenle</Text>
                </TouchableOpacity>
              </View>

              {/* Quick Preset Tags List */}
              <View style={styles.tagsGrid}>
                {quickTags.map((tag) => (
                  <TouchableOpacity
                    key={tag.id}
                    style={styles.tagBtn}
                    onPress={() => {
                      setNoteInput((prev) => (prev ? `${prev}, ${tag.text}` : tag.text));
                    }}
                  >
                    <Text style={styles.tagText}>{tag.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Active Lesson & Time Indicator */}
              {activeLesson ? (
                <View style={styles.activeLessonBanner}>
                  <View style={styles.activeDot} />
                  <Ionicons name="school" size={13} color="#047857" />
                  <Text style={styles.activeLessonBannerText}>
                    Şu anki ders: <Text style={{ fontWeight: '800' }}>{activeLesson.fullText}</Text>{' '}
                    ({activeLesson.startTime} - {activeLesson.endTime})
                  </Text>
                </View>
              ) : (
                <View style={styles.timeBanner}>
                  <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
                  <Text style={styles.timeBannerText}>
                    Tarih: {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}, {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} (Ders dışı)
                  </Text>
                </View>
              )}

              {/* Note Input */}
              <Input
                label={
                  editingNoteId
                    ? 'Görüşü Düzenle'
                    : `Öğrenci Görüşü (${getCurrentDateTimeString()})`
                }
                placeholder="Örn: Bu derste derse çok ilgiliydi veya ödevini eksik yapmış..."
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
                        <View style={styles.historyMetaWrap}>
                          <View style={styles.historyDateBadge}>
                            <Ionicons name="time-outline" size={12} color={Colors.primary} />
                            <Text style={styles.historyDateText}>
                              {formatDateToTR(item.note_date)}
                            </Text>
                          </View>

                          {item.lesson_info ? (
                            <View style={styles.historyLessonBadge}>
                              <Ionicons name="school" size={11} color="#047857" />
                              <Text style={styles.historyLessonText}>{item.lesson_info}</Text>
                            </View>
                          ) : null}
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

      {/* QUICK NOTES MANAGEMENT MODAL */}
      <Modal visible={manageModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContainer, { maxHeight: '88%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Hızlı Görüş Şablonları</Text>
                <Text style={styles.modalSub}>
                  Tek dokunuşla eklenecek hazır ifadeleri belirleyin
                </Text>
              </View>
              <TouchableOpacity onPress={() => setManageModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Add new tag row */}
            <View style={styles.addTagRow}>
              <View style={{ flex: 1 }}>
                <Input
                  placeholder="Yeni şablon yazın (Örn: Ödevini çok güzel yapmış ⭐)..."
                  value={newTagInput}
                  onChangeText={setNewTagInput}
                  style={{ height: 40 }}
                />
              </View>
              <Button
                title="Ekle"
                icon="add"
                size="sm"
                onPress={handleAddNewTag}
                style={{ height: 40, marginTop: 4 }}
              />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 10 }}>
              <Text style={styles.manageListTitle}>Kayıtlı Şablonlar ({quickTags.length})</Text>
              {quickTags.map((tag) => {
                const isEditing = editingTag?.id === tag.id;
                return (
                  <View key={tag.id} style={styles.manageTagCard}>
                    {isEditing ? (
                      <View style={styles.tagEditRow}>
                        <View style={{ flex: 1 }}>
                          <Input
                            value={editingTagInput}
                            onChangeText={setEditingTagInput}
                            style={{ height: 38 }}
                          />
                        </View>
                        <TouchableOpacity
                          style={styles.saveTagBtn}
                          onPress={handleSaveEditTag}
                        >
                          <Ionicons name="checkmark" size={18} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cancelTagBtn}
                          onPress={() => setEditingTag(null)}
                        >
                          <Ionicons name="close" size={18} color={Colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.tagDisplayRow}>
                        <Text style={styles.manageTagText}>{tag.text}</Text>
                        <View style={styles.manageTagActions}>
                          <TouchableOpacity
                            style={styles.tagActionBtn}
                            onPress={() => handleStartEditTag(tag)}
                          >
                            <Ionicons name="pencil" size={15} color={Colors.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.tagActionBtn}
                            onPress={() => handleDeleteTag(tag)}
                          >
                            <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.manageModalFooter}>
              <TouchableOpacity
                style={styles.resetTagsBtn}
                onPress={handleResetDefaultTags}
              >
                <Ionicons name="refresh-outline" size={15} color={Colors.textSecondary} />
                <Text style={styles.resetTagsBtnText}>Varsayılanlara Sıfırla</Text>
              </TouchableOpacity>

              <Button
                title="Tamam"
                size="sm"
                onPress={() => setManageModalVisible(false)}
                style={{ minWidth: 100 }}
              />
            </View>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
  },
  settingsHeaderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
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
    backgroundColor: Colors.cardSubtle,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: '#fff',
  },
  chipSub: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  chipSubActive: {
    color: '#E0E7FF',
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  studentCard: {
    padding: 12,
    marginBottom: 8,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  noText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primary,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  clickHint: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
    paddingBottom: 36,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
    marginBottom: 14,
  },
  presetLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  presetLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  editPresetsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  editPresetsLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
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
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  saveBtnRow: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  historySection: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 14,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  emptyHistoryText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  historyCard: {
    padding: 10,
    marginBottom: 6,
    backgroundColor: Colors.cardSubtle,
  },
  historyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
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
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  addTagRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  manageListTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 8,
    marginTop: 4,
  },
  manageTagCard: {
    backgroundColor: Colors.cardSubtle,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagDisplayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  manageTagText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
  },
  manageTagActions: {
    flexDirection: 'row',
    gap: 8,
  },
  tagActionBtn: {
    padding: 5,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saveTagBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelTagBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageModalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  resetTagsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 6,
  },
  resetTagsBtnText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  historyMetaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  historyLessonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  historyLessonText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  activeLessonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 6,
    marginBottom: 8,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  activeLessonBannerText: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '600',
  },
  timeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSubtle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
    marginBottom: 8,
  },
  timeBannerText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
});
