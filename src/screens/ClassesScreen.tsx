import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { EmptyState } from '../components/EmptyState';
import {
  getClasses,
  createClass,
  updateClass,
  deleteClass,
} from '../database/operations/classOperations';
import {
  bulkCreateStudentsMultipleClasses,
  getAllStudentsWithClass,
  StudentWithClass,
} from '../database/operations/studentOperations';
import {
  pickAndParseStudentsExcel,
  generateStudentTemplateExcel,
  validateBulkStudentImport,
  BulkImportValidation,
} from '../utils/excelService';
import { ClassItem } from '../types';
import { getActiveSchool, School } from '../database/operations/schoolOperations';

export const ClassesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSchool, setActiveSchool] = useState<School | null>(null);

  // Class create/edit modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [classNameInput, setClassNameInput] = useState('');
  const [classDescInput, setClassDescInput] = useState('');

  // Bulk Excel import modal & state
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [validationResult, setValidationResult] = useState<BulkImportValidation | null>(null);
  const [loadingBulk, setLoadingBulk] = useState(false);

  // Global student search
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StudentWithClass[]>([]);
  const [allStudentsCache, setAllStudentsCache] = useState<StudentWithClass[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  const loadClasses = async () => {
    try {
      const active = await getActiveSchool();
      setActiveSchool(active);
      const data = await getClasses();
      setClasses(data);
    } catch (error) {
      console.error('Error loading classes:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadClasses();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadClasses();
    setRefreshing(false);
  };

  const handleOpenSearch = async () => {
    setSearchModalVisible(true);
    setSearchQuery('');
    setSearchResults([]);
    if (!allStudentsCache.length) {
      setSearchLoading(true);
      try {
        const all = await getAllStudentsWithClass();
        setAllStudentsCache(all);
      } catch (e) {
        console.warn('Student load error:', e);
      } finally {
        setSearchLoading(false);
      }
    }
    setTimeout(() => searchInputRef.current?.focus(), 300);
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    const lower = q.trim().toLowerCase();
    const results = allStudentsCache.filter((s) =>
      s.first_name.toLowerCase().includes(lower) ||
      s.last_name.toLowerCase().includes(lower) ||
      (s.first_name + ' ' + s.last_name).toLowerCase().includes(lower) ||
      (s.student_number || '').toLowerCase().includes(lower)
    );
    setSearchResults(results);
  };

  const handleCloseSearch = () => {
    setSearchModalVisible(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleOpenAdd = () => {
    setEditingClass(null);
    setClassNameInput('');
    setClassDescInput('');
    setModalVisible(true);
  };

  const handleOpenEdit = (c: ClassItem) => {
    setEditingClass(c);
    setClassNameInput(c.name);
    setClassDescInput(c.description || '');
    setModalVisible(true);
  };

  const handleSaveClass = async () => {
    if (!classNameInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen şube adı giriniz (Örn: 12-A).');
      return;
    }

    try {
      if (editingClass) {
        await updateClass(editingClass.id, classNameInput, classDescInput);
      } else {
        await createClass(classNameInput, classDescInput);
      }
      setModalVisible(false);
      loadClasses();
    } catch (error: any) {
      Alert.alert('Hata', 'Bu şube adı zaten mevcut olabilir veya bir hata oluştu.');
    }
  };

  const handleDeleteClass = (c: ClassItem) => {
    Alert.alert(
      'Şubeyi Sil',
      `"${c.name}" şubesini ve bu şubeye ait tüm öğrenci, ödev ve kayıtları silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteClass(c.id);
              loadClasses();
            } catch (error) {
              Alert.alert('Hata', 'Şube silinirken bir sorun oluştu.');
            }
          },
        },
      ]
    );
  };

  // Bulk Import Handlers
  const handleDownloadTemplate = async () => {
    try {
      setLoadingBulk(true);
      await generateStudentTemplateExcel();
    } catch (e: any) {
      Alert.alert('Hata', 'Şablon dosyası oluşturulamadı: ' + (e?.message || e));
    } finally {
      setLoadingBulk(false);
    }
  };

  const handlePickBulkExcel = async () => {
    try {
      setLoadingBulk(true);
      const parsed = await pickAndParseStudentsExcel();
      if (parsed.length === 0) {
        setLoadingBulk(false);
        return;
      }

      const currentClasses = await getClasses();
      if (currentClasses.length === 0) {
        setLoadingBulk(false);
        Alert.alert(
          'Kayıtlı Şube Yok',
          'Sistemde henüz kayıtlı şube bulunmamaktadır. Öğrencileri yükleyebilmek için lütfen önce "Şube Ekle" butonu ile şubelerinizi oluşturunuz.'
        );
        return;
      }

      const valResult = validateBulkStudentImport(parsed, currentClasses);
      setValidationResult(valResult);
      setBulkModalVisible(true);
    } catch (error: any) {
      Alert.alert('Hata', error?.message || 'Excel dosyası okunamadı.');
    } finally {
      setLoadingBulk(false);
    }
  };

  const handleConfirmBulkImport = async () => {
    if (!validationResult || validationResult.validPayloads.length === 0) {
      Alert.alert('Hata', 'İçe aktarılacak geçerli şube ve öğrenci bulunmuyor.');
      return;
    }

    try {
      setLoadingBulk(true);
      const res = await bulkCreateStudentsMultipleClasses(validationResult.validPayloads);
      setBulkModalVisible(false);
      setValidationResult(null);
      await loadClasses();

      const breakdown = res.details
        .map((d) => `• ${d.className}: ${d.added} öğrenci`)
        .join('\n');

      Alert.alert(
        'Toplu Yükleme Başarılı',
        `Toplam ${res.totalAdded} öğrenci şubelerine başarıyla eklendi!\n\n${breakdown}`
      );
    } catch (e: any) {
      Alert.alert('Hata', 'Toplu öğrenci yüklenirken bir sorun oluştu: ' + (e?.message || e));
    } finally {
      setLoadingBulk(false);
    }
  };

  const totalStudents = classes.reduce((sum, c) => sum + (c.student_count || 0), 0);

  const schoolBgTint = activeSchool?.color ? `${activeSchool.color}0E` : Colors.background;

  return (
    <View style={[styles.container, { backgroundColor: schoolBgTint }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Okul Şubeleri</Text>
          <Text style={styles.headerSub}>Toplam {classes.length} şube, {totalStudents} öğrenci</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.searchIconBtn}
            onPress={handleOpenSearch}
            accessibilityLabel="Öğrenci Ara"
          >
            <Ionicons name="search" size={19} color={Colors.primary} />
          </TouchableOpacity>
          <Button
            title="Şube Ekle"
            icon="add"
            size="sm"
            onPress={handleOpenAdd}
          />
        </View>
      </View>

      {/* Bulk Excel Action Strip */}
      <View style={styles.actionStrip}>
        <TouchableOpacity
          style={styles.actionStripBtn}
          onPress={() => {
            setValidationResult(null);
            setBulkModalVisible(true);
          }}
          disabled={loadingBulk}
        >
          <Ionicons name="cloud-upload-outline" size={17} color={Colors.primary} />
          <Text style={styles.actionStripBtnText}>Toplu Öğrenci Yükle (Excel)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionStripSecondaryBtn}
          onPress={handleDownloadTemplate}
          disabled={loadingBulk}
        >
          <Ionicons name="document-text-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.actionStripSecondaryBtnText}>Şablon İndir</Text>
        </TouchableOpacity>
      </View>

      {/* Class List */}
      <FlatList
        data={classes}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState
            icon="school-outline"
            title="Henüz Şube Eklenmemiş"
            description="Öğrencilerinizi ve derslerinizi takip etmek için ilk şubenizi ekleyin."
            actionTitle="Yeni Şube Ekle"
            onAction={handleOpenAdd}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() =>
              navigation.navigate('ClassDetail', {
                classId: item.id,
                className: item.name,
              })
            }
          >
            <Card style={styles.classCard}>
              <View style={styles.classRow}>
                <View style={styles.classIconWrap}>
                  <Text style={styles.classAvatarText}>{item.name}</Text>
                </View>
                <View style={styles.classInfo}>
                  <Text style={styles.className}>{item.name}</Text>
                  {item.description ? (
                    <Text style={styles.classDesc}>{item.description}</Text>
                  ) : null}
                  <View style={styles.studentBadge}>
                    <Ionicons name="people-outline" size={14} color={Colors.primary} />
                    <Text style={styles.studentCount}>
                      {item.student_count || 0} Öğrenci
                    </Text>
                  </View>
                </View>
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => handleOpenEdit(item)}
                  >
                    <Ionicons name="pencil" size={16} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => handleDeleteClass(item)}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />

      {/* Class Create / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingClass ? 'Şubeyi Düzenle' : 'Yeni Şube Ekle'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Input
              label="Şube Adı *"
              placeholder="Örn: 12-A, 10-B, 9-C"
              value={classNameInput}
              onChangeText={setClassNameInput}
              autoCapitalize="characters"
            />

            <Input
              label="Açıklama (Opsiyonel)"
              placeholder="Örn: Sayısal, Eşit Ağırlık..."
              value={classDescInput}
              onChangeText={setClassDescInput}
            />

            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setModalVisible(false)}
              />
              <Button
                title="Kaydet"
                style={{ flex: 1 }}
                onPress={handleSaveClass}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* BULK EXCEL IMPORT MODAL */}
      <Modal visible={bulkModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Tüm Şubelere Toplu Öğrenci Yükle</Text>
                <Text style={styles.modalSub}>Excel ile tüm sınıfların listesini tek seferde aktarın</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setBulkModalVisible(false);
                  setValidationResult(null);
                }}
              >
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {loadingBulk ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.loadingText}>İşleniyor, lütfen bekleyiniz...</Text>
                </View>
              ) : !validationResult ? (
                /* Step 1 & 2: Instructions and File Selector */
                <View>
                  <View style={styles.guideCard}>
                    <Text style={styles.guideStepTitle}>Adım 1: Hazır Şablonu İndirin</Text>
                    <Text style={styles.guideStepDesc}>
                      Şablon dosyasının 2. sayfasında sisteminizde kayıtlı şubeler yer alır. Hatalı sınıf girmemek için şube isimlerini oradan kontrol edebilirsiniz.
                    </Text>
                    <TouchableOpacity
                      style={styles.templateDownloadBtn}
                      onPress={handleDownloadTemplate}
                    >
                      <Ionicons name="download-outline" size={16} color={Colors.primary} />
                      <Text style={styles.templateDownloadBtnText}>Excel Şablonunu İndir (.xlsx)</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.guideCard, { marginTop: 12 }]}>
                    <Text style={styles.guideStepTitle}>Adım 2: Excel Dosyasını Yükleyin</Text>
                    <Text style={styles.guideStepDesc}>
                      Öğrenci numarası, adı, soyadı ve şubesi doldurulmuş Excel dosyanızı seçin.
                    </Text>
                    <TouchableOpacity
                      style={styles.pickExcelBtn}
                      onPress={handlePickBulkExcel}
                    >
                      <Ionicons name="folder-open-outline" size={20} color="#fff" />
                      <Text style={styles.pickExcelBtnText}>Excel Dosyası Seç</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* Validation Preview Summary */
                <View>
                  <View style={styles.summaryHeader}>
                    <Text style={styles.summaryTitle}>Yükleme Önizlemesi</Text>
                    <Text style={styles.summarySub}>
                      Dosyadan tespit edilen toplam {validationResult.totalStudents} öğrenci
                    </Text>
                  </View>

                  {/* Valid matched classes */}
                  {validationResult.validPayloads.length > 0 && (
                    <View style={styles.previewSection}>
                      <Text style={styles.previewSectionTitle}>
                        ✅ Eşleşen Şubeler ({validationResult.validCount} Öğrenci):
                      </Text>
                      {validationResult.validPayloads.map((p) => (
                        <View key={p.classId} style={styles.matchedClassRow}>
                          <View style={styles.matchedClassBadge}>
                            <Text style={styles.matchedClassName}>{p.className}</Text>
                          </View>
                          <Text style={styles.matchedCountText}>
                            {p.students.length} öğrenci aktarılacak
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Unmatched classes warning */}
                  {validationResult.unmatchedClasses.length > 0 && (
                    <View style={styles.warningBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Ionicons name="warning-outline" size={18} color="#B45309" />
                        <Text style={styles.warningTitle}>Sistemde Bulunamayan Şubeler:</Text>
                      </View>
                      <Text style={styles.warningDesc}>
                        Aşağıdaki şubeler sistemde kayıtlı olmadığı için bu öğrencileri aktaramayız. Şablondaki &apos;Kayıtlı Şubeler&apos; sayfasındaki isimleri kullanınız:
                      </Text>
                      {validationResult.unmatchedClasses.map((u, i) => (
                        <Text key={i} style={styles.unmatchedItemText}>
                          • &quot;{u.rawClassName}&quot;: {u.count} öğrenci (Atlanacak)
                        </Text>
                      ))}
                    </View>
                  )}

                  {/* Missing class name warning */}
                  {validationResult.missingClassStudents.length > 0 && (
                    <View style={[styles.warningBox, { marginTop: 8 }]}>
                      <Text style={styles.warningDesc}>
                        ⚠️ {validationResult.missingClassStudents.length} öğrencinin şube sütunu boş olduğu için aktarılmayacaktır.
                      </Text>
                    </View>
                  )}

                  {validationResult.validCount === 0 && (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorBoxText}>
                        Hiçbir öğrencinin şubesi sistemdeki şubelerle eşleşmedi. Lütfen şablonun 2. sayfasındaki şube adlarını kullanarak Excel dosyanızı kontrol ediniz.
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title={validationResult ? 'Geri' : 'Kapat'}
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => {
                  if (validationResult) {
                    setValidationResult(null);
                  } else {
                    setBulkModalVisible(false);
                  }
                }}
              />
              {validationResult && validationResult.validCount > 0 && (
                <Button
                  title={`Onayla ve Yükle (${validationResult.validCount})`}
                  style={{ flex: 2 }}
                  onPress={handleConfirmBulkImport}
                  loading={loadingBulk}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Global Student Search Modal ─────────────────────── */}
      <Modal
        visible={searchModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseSearch}
      >
        <View style={styles.searchModalOverlay}>
          <View style={styles.searchModalSheet}>
            {/* Drag Handle */}
            <View style={styles.sheetHandle} />

            {/* Header */}
            <View style={styles.searchModalHeader}>
              <View>
                <Text style={styles.modalTitle}>Öğrenci Ara</Text>
                <Text style={styles.modalSub}>Ad, soyad veya numara ile arayın</Text>
              </View>
              <TouchableOpacity style={styles.iconBtn} onPress={handleCloseSearch}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.searchInputWrap}>
              <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput}
                placeholder="Öğrenci adı, soyadı veya numarası..."
                placeholderTextColor={Colors.textMuted}
                value={searchQuery}
                onChangeText={handleSearch}
                autoCorrect={false}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => handleSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Results area */}
            {searchLoading ? (
              <View style={styles.searchCenterWrap}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.searchCenterText}>Öğrenciler yükleniyor...</Text>
              </View>
            ) : searchQuery.trim().length === 0 ? (
              <View style={styles.searchCenterWrap}>
                <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.searchCenterText}>
                  Aramak istediğiniz öğrencinin{'\n'}adını, soyadını veya numarasını yazın.
                </Text>
              </View>
            ) : searchResults.length === 0 ? (
              <View style={styles.searchCenterWrap}>
                <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.searchCenterText}>"{searchQuery}" için sonuç bulunamadı.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.searchResultCount}>{searchResults.length} öğrenci bulundu</Text>
                <FlatList
                  data={searchResults}
                  keyExtractor={(item) => item.id.toString()}
                  contentContainerStyle={{ paddingBottom: 16 }}
                  keyboardShouldPersistTaps="handled"
                  ItemSeparatorComponent={() => <View style={styles.searchSeparator} />}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.searchResultRow}
                      activeOpacity={0.7}
                      onPress={() => {
                        handleCloseSearch();
                        navigation.navigate('ClassDetail', {
                          classId: item.class_id,
                          className: item.class_name,
                        });
                      }}
                    >
                      <View style={styles.searchResultAvatar}>
                        <Text style={styles.searchResultAvatarText}>
                          {item.first_name.charAt(0)}{item.last_name.charAt(0)}
                        </Text>
                      </View>
                      <View style={styles.searchResultInfo}>
                        <Text style={styles.searchResultName}>
                          {item.first_name} {item.last_name}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                          {item.student_number ? (
                            <View style={styles.numBadge}>
                              <Text style={styles.numBadgeText}>#{item.student_number}</Text>
                            </View>
                          ) : null}
                          <View style={styles.classBadge}>
                            <Ionicons name="school-outline" size={11} color={Colors.primary} />
                            <Text style={styles.classBadgeText}>{item.class_name}</Text>
                          </View>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                />
              </>
            )}
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
    gap: 10,
  },
  searchIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Search Modal styles ──
  searchModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 18, 35, 0.55)',
    justifyContent: 'flex-end',
  },
  searchModalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 32,
    maxHeight: '88%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  searchModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  searchCenterWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  searchCenterText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  searchResultCount: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
    marginLeft: 2,
  },
  searchSeparator: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
  },
  searchResultAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  searchResultInfo: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  numBadge: {
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  numBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  classBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  classBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  actionStrip: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  actionStripBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  actionStripBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  actionStripSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 5,
  },
  actionStripSecondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  listContent: {
    padding: 16,
  },
  classCard: {
    padding: 14,
    marginBottom: 10,
  },
  classRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  classIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  classAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primary,
  },
  classInfo: {
    flex: 1,
  },
  className: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  classDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  studentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  studentCount: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
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
  modalSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  loadingContainer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  guideCard: {
    backgroundColor: Colors.cardSubtle,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  guideStepTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  guideStepDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 10,
  },
  templateDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 9,
    borderRadius: 8,
    gap: 6,
  },
  templateDownloadBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  pickExcelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  pickExcelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  summaryHeader: {
    backgroundColor: Colors.primaryLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  summarySub: {
    fontSize: 12,
    color: Colors.primaryDark,
    marginTop: 2,
  },
  previewSection: {
    marginBottom: 12,
  },
  previewSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 8,
  },
  matchedClassRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 6,
  },
  matchedClassBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  matchedClassName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
  },
  matchedCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
  },
  warningBox: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 8,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  warningDesc: {
    fontSize: 12,
    color: '#B45309',
    lineHeight: 17,
    marginBottom: 6,
  },
  unmatchedItemText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    marginLeft: 6,
    marginTop: 2,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    marginTop: 8,
  },
  errorBoxText: {
    fontSize: 12,
    color: '#991B1B',
    lineHeight: 18,
    fontWeight: '600',
  },
});
