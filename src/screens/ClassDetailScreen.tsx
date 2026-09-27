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
  Image,
  ScrollView,
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
  updateStudentPhoto,
  bulkUpdateStudentPhotos,
  bulkDeleteStudents,
  bulkTransferStudents,
} from '../database/operations/studentOperations';
import { getClasses } from '../database/operations/classOperations';
import {
  pickAndParseStudentsExcel,
  generateStudentTemplateExcel,
  exportClassStudentsToExcel,
} from '../utils/excelService';
import {
  pickSinglePhotoFromSource,
  savePhotoPermanently,
  pickBulkPhotosFromDevice,
  matchPhotosWithStudents,
  MAX_PHOTO_SIZE_BYTES,
  MAX_PHOTO_SIZE_LABEL,
  BulkPhotoMatchResult,
} from '../utils/photoService';
import { Student, ClassItem } from '../types';

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
  const [photoUriInput, setPhotoUriInput] = useState<string | null>(null);

  // Single Photo Action Modal state
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [photoTargetStudent, setPhotoTargetStudent] = useState<Student | null>(null);

  // Bulk Photo Modal state
  const [bulkPhotoModalVisible, setBulkPhotoModalVisible] = useState(false);
  const [bulkPhotoResult, setBulkPhotoResult] = useState<BulkPhotoMatchResult | null>(null);
  const [bulkPhotoSaving, setBulkPhotoSaving] = useState(false);

  // Multi-select / Bulk operations state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);

  // Bulk Transfer Modal state
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [availableClasses, setAvailableClasses] = useState<ClassItem[]>([]);
  const [selectedTargetClassId, setSelectedTargetClassId] = useState<number | null>(null);

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

  // --- MANUAL ADD / EDIT ---
  const handleOpenAdd = () => {
    setEditingStudent(null);
    setStudentNoInput('');
    setFirstNameInput('');
    setLastNameInput('');
    setNotesInput('');
    setPhotoUriInput(null);
    setModalVisible(true);
  };

  const handleOpenEdit = (s: Student) => {
    setEditingStudent(s);
    setStudentNoInput(s.student_number);
    setFirstNameInput(s.first_name);
    setLastNameInput(s.last_name);
    setNotesInput(s.notes || '');
    setPhotoUriInput(s.photo_uri || null);
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
          notesInput,
          photoUriInput
        );
      } else {
        await createStudent(
          classId,
          studentNoInput,
          firstNameInput,
          lastNameInput,
          notesInput,
          photoUriInput
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

  // --- SINGLE PHOTO PICKING ---
  const handleOpenPhotoOptions = (student: Student) => {
    setPhotoTargetStudent(student);
    setPhotoModalVisible(true);
  };

  const handlePickSinglePhoto = async (source: 'camera' | 'gallery') => {
    if (!photoTargetStudent) return;
    try {
      const picked = await pickSinglePhotoFromSource(source);
      if (!picked) return;

      // Check max size
      if (picked.size > MAX_PHOTO_SIZE_BYTES) {
        Alert.alert(
          'Boyut Hatası',
          `Seçilen fotoğraf boyutu ${MAX_PHOTO_SIZE_LABEL}'den büyük (${(
            picked.size /
            (1024 * 1024)
          ).toFixed(1)} MB). Lütfen daha küçük bir fotoğraf seçiniz.`
        );
        return;
      }

      // Save permanently to document directory
      const permanentUri = await savePhotoPermanently(
        picked.uri,
        photoTargetStudent.student_number || photoTargetStudent.id
      );

      // Save to DB
      await updateStudentPhoto(photoTargetStudent.id, permanentUri);
      setPhotoModalVisible(false);
      loadStudents();
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Fotoğraf seçilemedi.');
    }
  };

  const handleRemovePhoto = async () => {
    if (!photoTargetStudent) return;
    try {
      await updateStudentPhoto(photoTargetStudent.id, null);
      setPhotoModalVisible(false);
      loadStudents();
    } catch (error) {
      Alert.alert('Hata', 'Fotoğraf kaldırılamadı.');
    }
  };

  // --- BULK PHOTO PICKING & MATCHING ---
  const handleStartBulkPhoto = async () => {
    try {
      setLoading(true);
      const files = await pickBulkPhotosFromDevice();
      if (files.length === 0) {
        setLoading(false);
        return;
      }

      const matchResult = await matchPhotosWithStudents(files, students);
      setBulkPhotoResult(matchResult);
      setBulkPhotoModalVisible(true);
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Fotoğraflar seçilemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmBulkPhotos = async () => {
    if (!bulkPhotoResult || bulkPhotoResult.matched.length === 0) return;
    try {
      setBulkPhotoSaving(true);
      const dbMatches: { studentId: number; photoUri: string }[] = [];

      for (const item of bulkPhotoResult.matched) {
        const permanentUri = await savePhotoPermanently(
          item.fileUri,
          item.student.student_number || item.student.id
        );
        dbMatches.push({
          studentId: item.student.id,
          photoUri: permanentUri,
        });
      }

      await bulkUpdateStudentPhotos(dbMatches);
      setBulkPhotoModalVisible(false);
      loadStudents();
      Alert.alert(
        'Başarılı',
        `${dbMatches.length} öğrencinin fotoğrafı başarıyla yüklendi ve numaralarına göre eşleştirildi.`
      );
    } catch (error) {
      Alert.alert('Hata', 'Fotoğraflar kaydedilirken bir hata oluştu.');
    } finally {
      setBulkPhotoSaving(false);
    }
  };

  // --- MULTI-SELECT & BULK ACTIONS ---
  const toggleSelectionMode = () => {
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedStudentIds([]);
    } else {
      setSelectionMode(true);
      setSelectedStudentIds([]);
    }
  };

  const toggleSelectStudent = (id: number) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((sId) => sId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedStudentIds.length === filteredStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filteredStudents.map((s) => s.id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedStudentIds.length === 0) {
      Alert.alert('Uyarı', 'Lütfen silinecek öğrencileri seçiniz.');
      return;
    }

    Alert.alert(
      'Toplu Öğrenci Silme',
      `Seçilen ${selectedStudentIds.length} öğrenciyi silmek istediğinize emin misiniz? Bu işlem öğrencilerin tüm ödev ve not kayıtlarını da silecektir.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Tümünü Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await bulkDeleteStudents(selectedStudentIds);
              setSelectedStudentIds([]);
              setSelectionMode(false);
              loadStudents();
              Alert.alert('Başarılı', 'Seçilen öğrenciler silindi.');
            } catch (error) {
              Alert.alert('Hata', 'Öğrenciler silinirken hata oluştu.');
            }
          },
        },
      ]
    );
  };

  const handleOpenTransferModal = async () => {
    if (selectedStudentIds.length === 0) {
      Alert.alert('Uyarı', 'Lütfen şubesi değiştirilecek öğrencileri seçiniz.');
      return;
    }
    try {
      const allClasses = await getClasses();
      const otherClasses = allClasses.filter((c) => c.id !== classId);
      if (otherClasses.length === 0) {
        Alert.alert('Bilgi', 'Aktarım yapılabilecek başka bir şube bulunmuyor.');
        return;
      }
      setAvailableClasses(otherClasses);
      setSelectedTargetClassId(otherClasses[0].id);
      setTransferModalVisible(true);
    } catch (error) {
      Alert.alert('Hata', 'Şubeler yüklenemedi.');
    }
  };

  const handleConfirmTransfer = async () => {
    if (!selectedTargetClassId) return;
    const targetClass = availableClasses.find((c) => c.id === selectedTargetClassId);
    try {
      await bulkTransferStudents(selectedStudentIds, selectedTargetClassId);
      setTransferModalVisible(false);
      setSelectedStudentIds([]);
      setSelectionMode(false);
      loadStudents();
      Alert.alert(
        'Başarılı',
        `Seçilen ${selectedStudentIds.length} öğrenci "${targetClass?.name}" şubesine aktarıldı.`
      );
    } catch (error) {
      Alert.alert('Hata', 'Şube değişikliği yapılırken hata oluştu.');
    }
  };

  // --- EXCEL IMPORT & EXPORT ---
  const handleExcelImport = async () => {
    try {
      setLoading(true);
      const parsed = await pickAndParseStudentsExcel();
      if (parsed.length === 0) {
        setLoading(false);
        return;
      }

      const result = await bulkCreateStudents(classId, parsed);
      loadStudents();
      Alert.alert(
        'Başarılı',
        `${result.added} öğrenci eklendi.${result.skipped > 0 ? ` (${result.skipped} satır atlandı)` : ''}`
      );
    } catch (error: any) {
      setLoading(false);
      Alert.alert('Hata', error?.message || 'Excel dosyası okunamadı.');
    }
  };

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
        <View style={styles.actionRow}>
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
            <Ionicons name="download-outline" size={17} color={Colors.primary} />
            <Text style={styles.templateBtnText}>Şablon</Text>
          </TouchableOpacity>
        </View>

        {/* Secondary Action Row: Bulk Photo & Bulk Operations */}
        <View style={styles.actionRowSecond}>
          <TouchableOpacity
            style={styles.bulkPhotoBtn}
            onPress={handleStartBulkPhoto}
            activeOpacity={0.7}
          >
            <Ionicons name="images" size={15} color="#047857" />
            <Text style={styles.bulkPhotoBtnText}>Toplu Fotoğraf Yükle</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.selectionModeBtn, selectionMode && styles.selectionModeBtnActive]}
            onPress={toggleSelectionMode}
            activeOpacity={0.7}
          >
            <Ionicons
              name={selectionMode ? 'checkmark-done-circle' : 'checkbox-outline'}
              size={15}
              color={selectionMode ? '#FFFFFF' : Colors.textSecondary}
            />
            <Text
              style={[
                styles.selectionModeBtnText,
                selectionMode && styles.selectionModeBtnTextActive,
              ]}
            >
              {selectionMode ? 'İşlemleri Kapat' : 'Toplu İşlemler'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Selection Mode Toolbar (When Active) */}
      {selectionMode && (
        <View style={styles.selectionToolbar}>
          <View style={styles.selectionCountWrap}>
            <TouchableOpacity onPress={handleSelectAll} style={styles.selectAllBtn}>
              <Ionicons
                name={
                  selectedStudentIds.length === filteredStudents.length && filteredStudents.length > 0
                    ? 'checkbox'
                    : 'square-outline'
                }
                size={18}
                color={Colors.primary}
              />
              <Text style={styles.selectAllText}>
                {selectedStudentIds.length === filteredStudents.length ? 'Temizle' : 'Tümü'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.selectionCountText}>
              <Text style={{ fontWeight: '800', color: Colors.primary }}>
                {selectedStudentIds.length}
              </Text>{' '}
              öğrenci seçili
            </Text>
          </View>

          <View style={styles.selectionActionsRow}>
            <TouchableOpacity
              style={[
                styles.selectionActionBtn,
                styles.transferBtn,
                selectedStudentIds.length === 0 && styles.btnDisabled,
              ]}
              disabled={selectedStudentIds.length === 0}
              onPress={handleOpenTransferModal}
            >
              <Ionicons name="swap-horizontal" size={14} color="#0369A1" />
              <Text style={styles.transferBtnText}>Şube Değiştir</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.selectionActionBtn,
                styles.deleteBtn,
                selectedStudentIds.length === 0 && styles.btnDisabled,
              ]}
              disabled={selectedStudentIds.length === 0}
              onPress={handleBulkDelete}
            >
              <Ionicons name="trash-outline" size={14} color="#B91C1C" />
              <Text style={styles.deleteBtnText}>Sil</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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
              title={
                searchQuery ? 'Aramayla Eşleşen Öğrenci Bulunamadı' : 'Bu Şubede Henüz Öğrenci Yok'
              }
              description={
                searchQuery
                  ? 'Farklı bir isim veya numara ile aramayı deneyin.'
                  : 'Manuel olarak öğrenci ekleyebilir veya Excel listenizi doğrudan yükleyebilirsiniz.'
              }
              actionTitle={searchQuery ? undefined : 'Yeni Öğrenci Ekle'}
              onAction={searchQuery ? undefined : handleOpenAdd}
            />
          }
          renderItem={({ item }) => {
            const isSelected = selectedStudentIds.includes(item.id);

            return (
              <Card
                style={[styles.studentCard, isSelected && styles.studentCardSelected]}
              >
                <View style={styles.studentRow}>
                  {/* Selection Checkbox */}
                  {selectionMode && (
                    <TouchableOpacity
                      style={styles.checkboxTouch}
                      onPress={() => toggleSelectStudent(item.id)}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isSelected ? Colors.primary : Colors.textMuted}
                      />
                    </TouchableOpacity>
                  )}

                  {/* Student Avatar / Photo */}
                  <TouchableOpacity
                    style={styles.avatarWrap}
                    onPress={() => handleOpenPhotoOptions(item)}
                    activeOpacity={0.8}
                  >
                    {item.photo_uri ? (
                      <Image source={{ uri: item.photo_uri }} style={styles.avatarImg} />
                    ) : (
                      <View style={styles.numberBadge}>
                        <Text style={styles.numberText}>{item.student_number || '-'}</Text>
                      </View>
                    )}
                    <View style={styles.cameraIconBadge}>
                      <Ionicons name="camera" size={9} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>

                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>
                      {item.first_name} {item.last_name}
                    </Text>
                    <Text style={styles.studentSubInfo}>
                      No: {item.student_number || '-'}
                      {item.notes ? ` • ${item.notes}` : ''}
                    </Text>
                  </View>

                  {!selectionMode && (
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
                  )}
                </View>
              </Card>
            );
          }}
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

      {/* Single Photo Action Modal */}
      <Modal visible={photoModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.photoActionCard}>
            <View style={styles.photoActionHeader}>
              <Text style={styles.photoActionTitle}>Öğrenci Fotoğrafı</Text>
              <Text style={styles.photoActionSub}>
                {photoTargetStudent?.first_name} {photoTargetStudent?.last_name} (No:{' '}
                {photoTargetStudent?.student_number})
              </Text>
            </View>

            {photoTargetStudent?.photo_uri ? (
              <View style={styles.previewImageWrap}>
                <Image
                  source={{ uri: photoTargetStudent.photo_uri }}
                  style={styles.previewAvatarLarge}
                />
              </View>
            ) : null}

            <View style={styles.photoActionButtons}>
              <TouchableOpacity
                style={styles.photoChoiceBtn}
                onPress={() => handlePickSinglePhoto('camera')}
              >
                <Ionicons name="camera" size={20} color={Colors.primary} />
                <Text style={styles.photoChoiceText}>Kamera ile Çek</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.photoChoiceBtn}
                onPress={() => handlePickSinglePhoto('gallery')}
              >
                <Ionicons name="images" size={20} color={Colors.secondary} />
                <Text style={styles.photoChoiceText}>Galeriden Seç</Text>
              </TouchableOpacity>

              {photoTargetStudent?.photo_uri ? (
                <TouchableOpacity
                  style={[styles.photoChoiceBtn, { borderColor: '#FECACA' }]}
                  onPress={handleRemovePhoto}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                  <Text style={[styles.photoChoiceText, { color: Colors.danger }]}>
                    Fotoğrafı Kaldır
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.photoCancelBtn}
                onPress={() => setPhotoModalVisible(false)}
              >
                <Text style={styles.photoCancelText}>Vazgeç</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bulk Photo Import Modal */}
      <Modal visible={bulkPhotoModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Toplu Fotoğraf Eşleştirme</Text>
                <Text style={styles.photoActionSub}>
                  Dosya adındaki numaralar ile öğrenciler eşleştirildi
                </Text>
              </View>
              <TouchableOpacity onPress={() => setBulkPhotoModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {bulkPhotoResult && (
              <>
                {/* Stats Bar */}
                <View style={styles.bulkStatsRow}>
                  <View style={styles.bulkStatPill}>
                    <Text style={styles.bulkStatNum}>{bulkPhotoResult.totalFiles}</Text>
                    <Text style={styles.bulkStatLabel}>Seçilen</Text>
                  </View>
                  <View style={[styles.bulkStatPill, { backgroundColor: '#DCFCE7' }]}>
                    <Text style={[styles.bulkStatNum, { color: '#166534' }]}>
                      {bulkPhotoResult.matched.length}
                    </Text>
                    <Text style={[styles.bulkStatLabel, { color: '#166534' }]}>Eşleşen</Text>
                  </View>
                  {bulkPhotoResult.oversizedCount > 0 && (
                    <View style={[styles.bulkStatPill, { backgroundColor: '#FEE2E2' }]}>
                      <Text style={[styles.bulkStatNum, { color: '#991B1B' }]}>
                        {bulkPhotoResult.oversizedCount}
                      </Text>
                      <Text style={[styles.bulkStatLabel, { color: '#991B1B' }]}>
                        {`>${MAX_PHOTO_SIZE_LABEL}`}
                      </Text>
                    </View>
                  )}
                  <View style={styles.bulkStatPill}>
                    <Text style={styles.bulkStatNum}>
                      {bulkPhotoResult.unmatched.filter((u) => u.reason === 'not_found').length}
                    </Text>
                    <Text style={styles.bulkStatLabel}>Eşleşmeyen</Text>
                  </View>
                </View>

                {bulkPhotoResult.oversizedCount > 0 && (
                  <View style={styles.oversizedWarningBox}>
                    <Ionicons name="alert-circle" size={16} color="#B91C1C" />
                    <Text style={styles.oversizedWarningText}>
                      {bulkPhotoResult.oversizedCount} dosya {MAX_PHOTO_SIZE_LABEL} sınırını aştığı için yüklenmeyecektir.
                    </Text>
                  </View>
                )}

                {/* Matched List */}
                <Text style={styles.listSectionTitle}>
                  Eşleşen Öğrenciler ({bulkPhotoResult.matched.length})
                </Text>

                <ScrollView style={styles.matchedScroll}>
                  {bulkPhotoResult.matched.length === 0 ? (
                    <Text style={styles.emptyMatchText}>
                      Seçilen dosyalar ile bu şubedeki öğrencilerin numaraları eşleşmedi. Dosya adının öğrenci numarasıyla (örn: 105.jpg) aynı olduğundan emin olun.
                    </Text>
                  ) : (
                    bulkPhotoResult.matched.map((item, idx) => (
                      <View key={idx} style={styles.matchItemRow}>
                        <Image source={{ uri: item.fileUri }} style={styles.matchThumb} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.matchStudentName}>
                            {item.student.first_name} {item.student.last_name}
                          </Text>
                          <Text style={styles.matchMeta}>
                            No: {item.student.student_number} • Dosya: {item.fileName} (
                            {(item.fileSize / 1024).toFixed(0)} KB)
                          </Text>
                        </View>
                        <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                      </View>
                    ))
                  )}
                </ScrollView>

                <View style={styles.modalActions}>
                  <Button
                    title="Vazgeç"
                    variant="outline"
                    style={{ flex: 1 }}
                    onPress={() => setBulkPhotoModalVisible(false)}
                  />
                  <Button
                    title={
                      bulkPhotoSaving
                        ? 'Kaydediliyor...'
                        : `${bulkPhotoResult.matched.length} Fotoğrafı Kaydet`
                    }
                    disabled={bulkPhotoResult.matched.length === 0 || bulkPhotoSaving}
                    style={{ flex: 1.5 }}
                    onPress={handleConfirmBulkPhotos}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Bulk Transfer Class Modal */}
      <Modal visible={transferModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Şube Değiştir</Text>
                <Text style={styles.photoActionSub}>
                  Seçilen {selectedStudentIds.length} öğrencinin aktarılacağı şubeyi seçiniz:
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTransferModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 250, marginVertical: 10 }}>
              {availableClasses.map((cls) => {
                const isSelected = selectedTargetClassId === cls.id;
                return (
                  <TouchableOpacity
                    key={cls.id}
                    style={[
                      styles.classChoiceRow,
                      isSelected && styles.classChoiceRowSelected,
                    ]}
                    onPress={() => setSelectedTargetClassId(cls.id)}
                  >
                    <View style={styles.classChoiceInfo}>
                      <Text style={styles.classChoiceName}>{cls.name}</Text>
                      {cls.description ? (
                        <Text style={styles.classChoiceSub}>{cls.description}</Text>
                      ) : null}
                    </View>
                    <Ionicons
                      name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={isSelected ? Colors.primary : Colors.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setTransferModalVisible(false)}
              />
              <Button
                title="Şubeyi Değiştir"
                style={{ flex: 1 }}
                onPress={handleConfirmTransfer}
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  actionRowSecond: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulkPhotoBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    gap: 5,
  },
  bulkPhotoBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  selectionModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 5,
  },
  selectionModeBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  selectionModeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  selectionModeBtnTextActive: {
    color: '#FFFFFF',
  },
  selectionToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.primaryLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primaryMuted,
  },
  selectionCountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: Colors.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.primaryMuted,
  },
  selectAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  selectionCountText: {
    fontSize: 12,
    color: Colors.textPrimary,
  },
  selectionActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectionActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
  },
  transferBtn: {
    backgroundColor: '#E0F2FE',
    borderColor: '#7DD3FC',
  },
  transferBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  deleteBtn: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  deleteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B91C1C',
  },
  btnDisabled: {
    opacity: 0.4,
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
  studentCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxTouch: {
    marginRight: 10,
    padding: 2,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 12,
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1.5,
    borderColor: Colors.primaryMuted,
  },
  numberBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  numberText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  studentSubInfo: {
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
    alignItems: 'flex-start',
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
    marginTop: 14,
  },
  photoActionCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    margin: 20,
    padding: 20,
    alignSelf: 'center',
    width: '90%',
  },
  photoActionHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  photoActionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  photoActionSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  previewImageWrap: {
    alignItems: 'center',
    marginVertical: 10,
  },
  previewAvatarLarge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  photoActionButtons: {
    gap: 8,
    marginTop: 6,
  },
  photoChoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  photoChoiceText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  photoCancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  photoCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  bulkStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  bulkStatPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: Colors.cardSubtle,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bulkStatNum: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  bulkStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 1,
  },
  oversizedWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
    gap: 6,
  },
  oversizedWarningText: {
    flex: 1,
    fontSize: 11,
    color: '#991B1B',
    fontWeight: '600',
  },
  listSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  matchedScroll: {
    maxHeight: 220,
    marginBottom: 10,
  },
  matchItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  matchThumb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.cardSubtle,
  },
  matchStudentName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  matchMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  emptyMatchText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
    lineHeight: 18,
  },
  classChoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
    backgroundColor: Colors.card,
  },
  classChoiceRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  classChoiceInfo: {
    flex: 1,
  },
  classChoiceName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  classChoiceSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
