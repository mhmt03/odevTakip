import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { EmptyState } from '../components/EmptyState';
import { Header } from '../components/Header';
import {
  getStudentsByClass,
  createStudent,
  updateStudent,
  deleteStudent,
  bulkCreateStudents,
} from '../database/operations/studentOperations';
import {
  pickAndParseStudentsExcel,
  generateStudentTemplateExcel,
  exportClassStudentsToExcel,
} from '../utils/excelService';
import { Student } from '../types';

export const ClassDetailScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { classId, className } = route.params;

  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Manual Add / Edit Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentNoInput, setStudentNoInput] = useState('');
  const [firstNameInput, setFirstNameInput] = useState('');
  const [lastNameInput, setLastNameInput] = useState('');
  const [notesInput, setNotesInput] = useState('');

  const loadStudents = async () => {
    try {
      setLoading(true);
      const data = await getStudentsByClass(classId);
      setStudents(data);
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadStudents();
    }, [classId])
  );

  const handleOpenAdd = () => {
    setEditingStudent(null);
    setStudentNoInput('');
    setFirstNameInput('');
    setLastNameInput('');
    setNotesInput('');
    setModalVisible(true);
  };

  const handleOpenEdit = (s: Student) => {
    setEditingStudent(s);
    setStudentNoInput(s.student_number);
    setFirstNameInput(s.first_name);
    setLastNameInput(s.last_name);
    setNotesInput(s.notes || '');
    setModalVisible(true);
  };

  const handleSaveStudent = async () => {
    if (!firstNameInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen öğrenci adını giriniz.');
      return;
    }
    if (!studentNoInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen öğrenci numarasını giriniz.');
      return;
    }

    try {
      if (editingStudent) {
        await updateStudent(
          editingStudent.id,
          studentNoInput,
          firstNameInput,
          lastNameInput,
          notesInput
        );
      } else {
        await createStudent(
          classId,
          studentNoInput,
          firstNameInput,
          lastNameInput,
          notesInput
        );
      }
      setModalVisible(false);
      loadStudents();
    } catch (error) {
      Alert.alert('Hata', 'Öğrenci kaydedilirken bir hata oluştu.');
    }
  };

  const handleDeleteStudent = (s: Student) => {
    Alert.alert(
      'Öğrenciyi Sil',
      `"${s.first_name} ${s.last_name}" öğrencisini silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteStudent(s.id);
              loadStudents();
            } catch (error) {
              Alert.alert('Hata', 'Öğrenci silinirken bir hata oluştu.');
            }
          },
        },
      ]
    );
  };

  // EXCEL IMPORT
  const handleExcelImport = async () => {
    try {
      setLoading(true);
      const parsed = await pickAndParseStudentsExcel();
      if (parsed.length === 0) {
        setLoading(false);
        return;
      }

      Alert.alert(
        'Excel İçe Aktar',
        `Seçilen dosyadan ${parsed.length} öğrenci tespit edildi. "${className}" şubesine eklensin mi?`,
        [
          { text: 'Vazgeç', style: 'cancel', onPress: () => setLoading(false) },
          {
            text: 'İçe Aktar',
            onPress: async () => {
              try {
                const res = await bulkCreateStudents(classId, parsed);
                Alert.alert(
                  'Başarılı',
                  `${res.added} öğrenci başarıyla eklendi.${res.skipped > 0 ? ` (${res.skipped} boş kayıt atlandı)` : ''}`
                );
                loadStudents();
              } catch (e) {
                Alert.alert('Hata', 'Excel aktarımı sırasında bir hata oluştu.');
              } finally {
                setLoading(false);
              }
            },
          },
        ]
      );
    } catch (error) {
      setLoading(false);
      Alert.alert('Hata', 'Excel dosyası okunamadı.');
    }
  };

  // EXCEL EXPORT
  const handleExcelExport = async () => {
    if (students.length === 0) {
      Alert.alert('Bilgi', 'Dışa aktarılacak öğrenci bulunmuyor.');
      return;
    }
    try {
      await exportClassStudentsToExcel(className, students);
    } catch (error) {
      Alert.alert('Hata', 'Excel dosyası oluşturulamadı.');
    }
  };

  // DOWNLOAD TEMPLATE
  const handleDownloadTemplate = async () => {
    try {
      await generateStudentTemplateExcel();
    } catch (error) {
      Alert.alert('Hata', 'Şablon dosyası oluşturulamadı.');
    }
  };

  const filteredStudents = students.filter((s) => {
    const term = searchQuery.toLowerCase();
    const fullName = `${s.first_name} ${s.last_name}`.toLowerCase();
    const no = (s.student_number || '').toLowerCase();
    return fullName.includes(term) || no.includes(term);
  });

  return (
    <View style={styles.container}>
      <Header
        title={className}
        subtitle={`${students.length} Kayıtlı Öğrenci`}
        showBack
        onBack={() => navigation.goBack()}
        rightAction={{
          icon: 'share-outline',
          label: 'Excel',
          onPress: handleExcelExport,
        }}
      />

      {/* Action Bar */}
      <View style={styles.actionBar}>
        <Button
          title="Manuel Ekle"
          icon="person-add"
          size="sm"
          onPress={handleOpenAdd}
          style={styles.actionBtn}
        />
        <Button
          title="Excel'den Yükle"
          icon="document-text"
          size="sm"
          variant="secondary"
          onPress={handleExcelImport}
          style={styles.actionBtn}
        />
        <TouchableOpacity
          style={styles.templateBtn}
          onPress={handleDownloadTemplate}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="download-outline" size={18} color={Colors.primary} />
          <Text style={styles.templateBtnText}>Şablon</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchWrapper}>
        <Input
          placeholder="Öğrenci adı, soyadı veya no ile ara..."
          icon="search"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onClear={() => setSearchQuery('')}
          style={{ height: 40 }}
        />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Yükleniyor...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredStudents}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title={searchQuery ? 'Aramayla Eşleşen Öğrenci Bulunamadı' : 'Bu Şubede Henüz Öğrenci Yok'}
              description={
                searchQuery
                  ? 'Farklı bir isim veya numara ile aramayı deneyin.'
                  : 'Manuel olarak öğrenci ekleyebilir veya Excel listenizi doğrudan yükleyebilirsiniz.'
              }
              actionTitle={searchQuery ? undefined : 'Yeni Öğrenci Ekle'}
              onAction={searchQuery ? undefined : handleOpenAdd}
            />
          }
          renderItem={({ item }) => (
            <Card style={styles.studentCard}>
              <View style={styles.studentRow}>
                <View style={styles.numberBadge}>
                  <Text style={styles.numberText}>{item.student_number || '-'}</Text>
                </View>

                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>
                    {item.first_name} {item.last_name}
                  </Text>
                  {item.notes ? (
                    <Text style={styles.studentNotes} numberOfLines={1}>
                      {item.notes}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.studentActions}>
                  {/* Quick opinion / note button */}
                  <TouchableOpacity
                    style={[styles.smallIconBtn, { backgroundColor: Colors.warningLight }]}
                    onPress={() => {
                      navigation.navigate('StudentNotesTab', {
                        initialClassId: classId,
                        initialStudentId: item.id,
                      });
                    }}
                  >
                    <Ionicons name="chatbox-ellipses" size={16} color={Colors.warningDark} />
                  </TouchableOpacity>

                  {/* Edit button */}
                  <TouchableOpacity
                    style={styles.smallIconBtn}
                    onPress={() => handleOpenEdit(item)}
                  >
                    <Ionicons name="pencil" size={16} color={Colors.textSecondary} />
                  </TouchableOpacity>

                  {/* Delete button */}
                  <TouchableOpacity
                    style={styles.smallIconBtn}
                    onPress={() => handleDeleteStudent(item)}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          )}
        />
      )}

      {/* Manual Student Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingStudent ? 'Öğrenciyi Düzenle' : 'Yeni Öğrenci Ekle'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Input
              label="Okul / Öğrenci No *"
              placeholder="Örn: 105"
              value={studentNoInput}
              onChangeText={setStudentNoInput}
              keyboardType="numeric"
            />

            <Input
              label="Öğrenci Adı *"
              placeholder="Örn: Ahmet"
              value={firstNameInput}
              onChangeText={setFirstNameInput}
            />

            <Input
              label="Öğrenci Soyadı"
              placeholder="Örn: Yılmaz"
              value={lastNameInput}
              onChangeText={setLastNameInput}
            />

            <Input
              label="Öğrenci Hakkında Not / Açıklama"
              placeholder="Örn: Ön sırada oturuyor vb."
              value={notesInput}
              onChangeText={setNotesInput}
            />

            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setModalVisible(false)}
              />
              <Button
                title={editingStudent ? 'Güncelle' : 'Kaydet'}
                style={{ flex: 1 }}
                onPress={handleSaveStudent}
              />
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
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
  },
  templateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    gap: 4,
  },
  templateBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  searchWrapper: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  studentCard: {
    padding: 12,
    marginBottom: 8,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  numberBadge: {
    minWidth: 42,
    height: 38,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginRight: 12,
  },
  numberText: {
    fontSize: 14,
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
  studentNotes: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  studentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
});
