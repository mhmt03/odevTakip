import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { EmptyState } from '../components/EmptyState';
import { PdfViewerModal } from '../components/PdfViewerModal';
import {
  getYearlyPlans,
  createYearlyPlan,
  updateYearlyPlan,
  deleteYearlyPlan,
  getScheduleInfoForCourseAndGrade,
  bulkCreateYearlyPlanItems,
  CourseGradeScheduleInfo,
  getYearlyPlanDocument,
  YearlyPlanDocument,
} from '../database/operations/yearlyPlanOperations';
import { getCourses } from '../database/operations/scheduleOperations';
import { getClasses } from '../database/operations/classOperations';
import {
  generateYearlyPlanTemplateExcel,
  pickAndParseYearlyPlanExcel,
  ParsedYearlyPlanRow,
} from '../utils/excelService';
import {
  pickAndSaveYearlyPlanPdf,
  viewYearlyPlanPdf,
  removeYearlyPlanPdf,
} from '../utils/pdfPlanService';
import { getTodayDateString, formatDateToTR } from '../utils/dateUtils';
import { getGradeLevels } from '../database/operations/gradeLevelOperations';
import { YearlyPlanItem, CourseName, ClassItem, GradeLevelItem } from '../types';

import { ensureGradesAndClassesDefined } from '../utils/setupChecks';
export const YearlyPlanScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [courses, setCourses] = useState<CourseName[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevelItem[]>([]);
  const [selectedGradeLevel, setSelectedGradeLevel] = useState<number>(11);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [plans, setPlans] = useState<YearlyPlanItem[]>([]);

  // Schedule verification for selected course + grade level
  const [scheduleInfo, setScheduleInfo] = useState<CourseGradeScheduleInfo | null>(null);

  // Single Add / Edit Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState<YearlyPlanItem | null>(null);
  const [formCourseId, setFormCourseId] = useState<number | null>(null);
  const [formGradeLevel, setFormGradeLevel] = useState<number>(11);
  const [formLessonHours, setFormLessonHours] = useState('4');
  const [formWeek, setFormWeek] = useState('1');
  const [formTopic, setFormTopic] = useState('');
  const [formOutcomes, setFormOutcomes] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');

  // Bulk Excel Import Modal State
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedYearlyPlanRow[]>([]);
  const [loadingExcel, setLoadingExcel] = useState(false);

  // PDF Document State
  const [pdfDoc, setPdfDoc] = useState<YearlyPlanDocument | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfViewerModalVisible, setPdfViewerModalVisible] = useState(false);

  const loadData = async () => {
    try {
      const [crs, cls, gLevels] = await Promise.all([
        getCourses(),
        getClasses(),
        getGradeLevels(),
      ]);
      setCourses(crs);
      setClasses(cls);
      setGradeLevels(gLevels);

      let targetGrade = selectedGradeLevel;
      if (gLevels.length > 0 && !gLevels.some((g) => g.level === targetGrade)) {
        targetGrade = gLevels[0].level;
        setSelectedGradeLevel(targetGrade);
      }

      let targetCourseId = selectedCourseId;
      if (!targetCourseId && crs.length > 0) {
        // Try selecting S.FZK or first course
        const defaultCourse = crs.find((c) => c.code === 'S.FZK') || crs[0];
        targetCourseId = defaultCourse.id;
        setSelectedCourseId(targetCourseId);
      }

      if (targetCourseId) {
        // Verify schedule for selected course and grade
        const schedInfo = await getScheduleInfoForCourseAndGrade(targetCourseId, targetGrade);
        setScheduleInfo(schedInfo);

        // Fetch plans and pdf document for this grade level and course
        const [planList, doc] = await Promise.all([
          getYearlyPlans(targetCourseId, targetGrade),
          getYearlyPlanDocument(targetCourseId, targetGrade),
        ]);
        setPlans(planList);
        setPdfDoc(doc);
      }
    } catch (e) {
      console.error('Error loading yearly plans:', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [selectedCourseId, selectedGradeLevel])
  );

  const handleSelectGrade = (grade: number) => {
    setSelectedGradeLevel(grade);
  };

  const handleSelectCourse = (courseId: number) => {
    setSelectedCourseId(courseId);
  };

  // Single Add / Edit
  const handleOpenAdd = () => {
    if (!scheduleInfo?.hasSchedule) {
      Alert.alert(
        'Ders Programı Bulunamadı',
        `${selectedGradeLevel}. Sınıf için seçilen derse ait ders programı henüz tanımlanmamıştır. Yıllık plan konularının haftalık ders saatlerinize göre dağıtılabilmesi için önce Ders Programınızı oluşturunuz.`,
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Ders Programına Git',
            onPress: () => navigation.navigate('ScheduleTab'),
          },
        ]
      );
      return;
    }

    setEditingPlan(null);
    setFormCourseId(selectedCourseId || (courses[0]?.id ?? null));
    setFormGradeLevel(selectedGradeLevel);
    setFormLessonHours(String(scheduleInfo?.totalWeeklyHours || 4));
    const nextWeek = plans.length > 0 ? Math.max(...plans.map((p) => p.week_number)) + 1 : 1;
    setFormWeek(String(nextWeek));
    setFormTopic('');
    setFormOutcomes('');
    setFormStartDate(getTodayDateString());
    setFormEndDate('');
    setModalVisible(true);
  };

  const handleOpenEdit = (item: YearlyPlanItem) => {
    setEditingPlan(item);
    setFormCourseId(item.course_id);
    setFormGradeLevel(item.grade_level || selectedGradeLevel);
    setFormLessonHours(String(item.lesson_hours || scheduleInfo?.totalWeeklyHours || 4));
    setFormWeek(String(item.week_number));
    setFormTopic(item.subject_topic);
    setFormOutcomes(item.learning_outcomes || '');
    setFormStartDate(item.date_start || '');
    setFormEndDate(item.date_end || '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formCourseId) {
      Alert.alert('Uyarı', 'Lütfen bir ders seçiniz.');
      return;
    }
    if (!formTopic.trim()) {
      Alert.alert('Uyarı', 'Lütfen deftere yazılacak konuyu giriniz.');
      return;
    }
    const weekNum = parseInt(formWeek, 10);
    if (isNaN(weekNum) || weekNum < 1) {
      Alert.alert('Uyarı', 'Geçerli bir hafta numarası giriniz.');
      return;
    }
    const hoursNum = parseInt(formLessonHours, 10) || 0;
    if (hoursNum < 1) {
      Alert.alert('Uyarı', 'Lütfen bu konu için geçerli bir ders saati giriniz (Zorunlu - Örn: 2 veya 4).');
      return;
    }

    try {
      if (editingPlan) {
        await updateYearlyPlan(
          editingPlan.id,
          formCourseId,
          weekNum,
          formTopic.trim(),
          null,
          formStartDate.trim() || undefined,
          formEndDate.trim() || undefined,
          formOutcomes.trim() || undefined,
          formGradeLevel,
          hoursNum
        );
      } else {
        await createYearlyPlan(
          formCourseId,
          weekNum,
          formTopic.trim(),
          null,
          formStartDate.trim() || undefined,
          formEndDate.trim() || undefined,
          formOutcomes.trim() || undefined,
          formGradeLevel,
          hoursNum
        );
      }
      setModalVisible(false);
      loadData();
    } catch (e) {
      Alert.alert('Hata', 'Yıllık plan kaydedilemedi.');
    }
  };

  const handleDelete = (item: YearlyPlanItem) => {
    Alert.alert(
      'Planı Sil',
      `"${item.week_number}. Hafta: ${item.subject_topic}" konusunu silmek istiyor musunuz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteYearlyPlan(item.id);
              loadData();
            } catch (e) {
              Alert.alert('Hata', 'Kayıt silinemedi.');
            }
          },
        },
      ]
    );
  };

  // PDF Document Handlers
  const handleUploadPdf = async () => {
    if (!selectedCourseId) {
      Alert.alert('Uyarı', 'Lütfen önce bir ders seçiniz.');
      return;
    }
    if (!(await ensureGradesAndClassesDefined('Yıllık plan ekleme'))) return;
    try {
      setLoadingPdf(true);
      const res = await pickAndSaveYearlyPlanPdf(selectedCourseId, selectedGradeLevel);
      if (res.success && res.document) {
        setPdfDoc(res.document);
        Alert.alert('Başarılı', `${selectedGradeLevel}. Sınıf yıllık plan PDF'i sisteme başarıyla kaydedildi.`);
      } else if (res.error && res.error !== 'Dosya seçimi iptal edildi.') {
        Alert.alert('Hata', res.error);
      }
    } catch (e: any) {
      Alert.alert('Hata', 'PDF yüklenirken bir sorun oluştu: ' + (e?.message || e));
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleViewPdf = () => {
    if (!pdfDoc) return;
    setPdfViewerModalVisible(true);
  };

  const handleDeletePdf = () => {
    if (!pdfDoc || !selectedCourseId) return;
    Alert.alert(
      'PDF Planı Sil',
      `"${pdfDoc.file_name}" dosyasını silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            await removeYearlyPlanPdf(selectedCourseId, selectedGradeLevel, pdfDoc.file_uri);
            setPdfDoc(null);
          },
        },
      ]
    );
  };

  // Bulk Excel Handlers
  const handleOpenBulkModal = async () => {
    if (!(await ensureGradesAndClassesDefined('Yıllık plan ekleme'))) return;
    if (!scheduleInfo?.hasSchedule) {
      Alert.alert(
        'Ders Programı Bulunamadı',
        `${selectedGradeLevel}. Sınıf için seçilen derse ait ders programı henüz tanımlanmamıştır. Yıllık plan konularının haftalık ders saatlerinize göre dağıtılabilmesi için önce Ders Programınızı oluşturunuz.`,
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Ders Programına Git',
            onPress: () => navigation.navigate('ScheduleTab'),
          },
        ]
      );
      return;
    }
    setParsedRows([]);
    setBulkModalVisible(true);
  };

  const handleDownloadTemplate = async () => {
    const activeCourse = courses.find((c) => c.id === selectedCourseId);
    const courseName = activeCourse ? activeCourse.name : 'Ders';
    const weeklyHours = scheduleInfo?.totalWeeklyHours || 4;

    try {
      setLoadingExcel(true);
      await generateYearlyPlanTemplateExcel(courseName, selectedGradeLevel, weeklyHours);
    } catch (e: any) {
      Alert.alert('Hata', 'Şablon dosyası oluşturulamadı: ' + (e?.message || e));
    } finally {
      setLoadingExcel(false);
    }
  };

  const handlePickExcel = async () => {
    try {
      setLoadingExcel(true);
      const rows = await pickAndParseYearlyPlanExcel();
      if (rows.length === 0) {
        setLoadingExcel(false);
        return;
      }
      setParsedRows(rows);
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Excel dosyası okunamadı.');
    } finally {
      setLoadingExcel(false);
    }
  };

  const handleConfirmBulkSave = async () => {
    if (!selectedCourseId || parsedRows.length === 0) return;

    try {
      setLoadingExcel(true);
      const payload = parsedRows.map((r) => ({
        weekNumber: r.weekNumber,
        dateStart: r.dateStart || undefined,
        dateEnd: r.dateEnd || undefined,
        lessonHours: r.lessonHours || scheduleInfo?.totalWeeklyHours || 4,
        subjectTopic: r.subjectTopic,
        learningOutcomes: r.learningOutcomes || undefined,
      }));

      const res = await bulkCreateYearlyPlanItems(
        selectedCourseId,
        selectedGradeLevel,
        payload,
        true // replace existing
      );

      setBulkModalVisible(false);
      setParsedRows([]);
      await loadData();

      Alert.alert(
        'Yıllık Plan Yüklendi 🎉',
        `${selectedGradeLevel}. Sınıf için toplam ${res.insertedCount} haftalık müfredat planı başarıyla kaydedildi!\n\n` +
          `Haftalık ders saatleriniz: ${scheduleInfo?.totalWeeklyHours} Saat\n` +
          `Şubeler: ${scheduleInfo?.distinctClasses.join(', ')}\n\n` +
          `Derse girdiğinizde deftere yazılacak konu ana sayfada otomatik gösterilecektir.`
      );
    } catch (e: any) {
      Alert.alert('Hata', 'Yıllık plan kaydedilirken bir hata oluştu: ' + (e?.message || e));
    } finally {
      setLoadingExcel(false);
    }
  };

  const today = getTodayDateString();
  const activeCourseObj = courses.find((c) => c.id === selectedCourseId);

  return (
    <View style={styles.container}>
      <Header
        title="Yıllık Müfredat Planı"
        subtitle="Haftalık konu ve defter takibi"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={{
          icon: 'add',
          label: 'Ekle',
          onPress: handleOpenAdd,
        }}
      />

      {/* 1. Sınıf Düzeyi Seçicisi */}
      <View style={styles.levelBar}>
        <View style={styles.levelBarHeader}>
          <Text style={styles.levelBarLabel}>Sınıf Düzeyi:</Text>
          <TouchableOpacity
            style={styles.manageLevelsBtn}
            onPress={() => navigation.navigate('ScheduleManage', { initialTab: 'grades' })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="settings-outline" size={13} color={Colors.primary} />
            <Text style={styles.manageLevelsBtnText}>Düzeyleri Yönet</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.levelScroll}>
          {gradeLevels.map((g) => {
            const isSel = selectedGradeLevel === g.level;
            return (
              <TouchableOpacity
                key={g.level}
                style={[styles.levelChip, isSel && styles.levelChipActive]}
                onPress={() => handleSelectGrade(g.level)}
              >
                <Text style={[styles.levelChipText, isSel && styles.levelChipTextActive]}>
                  {g.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 2. Ders Seçicisi */}
      <View style={styles.courseChipsBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
          {courses.map((crs) => {
            const isSelected = selectedCourseId === crs.id;
            return (
              <TouchableOpacity
                key={crs.id}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => handleSelectCourse(crs.id)}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                  {crs.code ? `[${crs.code}] ` : ''}
                  {crs.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 5. Yıllık Plan Listesi */}
      <FlatList
        data={plans}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.listHeaderWrapper}>
            {/* 3. Ders Programı Doğrulama ve Saat Bilgi Kartı */}
            <View style={styles.statusSection}>
              {scheduleInfo?.hasSchedule ? (
                <View style={styles.verifiedScheduleCard}>
                  <View style={styles.verifiedRow}>
                    <View style={styles.verifiedIconWrap}>
                      <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.verifiedTitle}>
                          {selectedGradeLevel}. Sınıf Ders Programı Doğrulandı
                        </Text>
                        <View style={styles.hoursBadge}>
                          <Text style={styles.hoursBadgeText}>
                            Haftalık {scheduleInfo.totalWeeklyHours} Saat
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.verifiedSub}>
                        Şubeler: {scheduleInfo.distinctClasses.join(', ')} ({scheduleInfo.daysSummary})
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.warningScheduleCard}>
                  <View style={styles.warningRow}>
                    <Ionicons name="warning-outline" size={20} color="#B45309" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.warningTitle}>
                        {selectedGradeLevel}. Sınıf İçin Ders Programı Bulunamadı
                      </Text>
                      <Text style={styles.warningSub}>
                        Haftalık ders saatinin hesaplanması ve günlere dağıtılabilmesi için önce ders programınızı oluşturunuz.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.goToScheduleBtn}
                      onPress={() => navigation.navigate('ScheduleTab')}
                    >
                      <Text style={styles.goToScheduleBtnText}>Programa Git</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* 4. Hızlı Aksiyon Şeridi (Excel Yükle & Şablon İndir) */}
            <View style={styles.actionStrip}>
              <TouchableOpacity
                style={styles.actionStripBtn}
                onPress={handleOpenBulkModal}
              >
                <Ionicons name="cloud-upload-outline" size={17} color={Colors.primary} />
                <Text style={styles.actionStripBtnText}>Excel ile Yıllık Plan Yükle</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionStripSecondaryBtn}
                onPress={handleDownloadTemplate}
                disabled={loadingExcel}
              >
                <Ionicons name="document-text-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.actionStripSecondaryBtnText}>Şablon İndir</Text>
              </TouchableOpacity>
            </View>

            {/* PDF Dosyası Yönetim Çubuğu */}
            <View style={styles.pdfSectionContainer}>
              {pdfDoc ? (
                <View style={styles.pdfBanner}>
                  <View style={styles.pdfIconCircle}>
                    <Ionicons name="document-text" size={18} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.pdfBannerTitle} numberOfLines={1}>{pdfDoc.file_name}</Text>
                    <Text style={styles.pdfBannerSub}>Yıllık Planın Orijinal PDF Dosyası</Text>
                  </View>
                  <TouchableOpacity style={styles.pdfViewBtn} onPress={handleViewPdf} activeOpacity={0.8}>
                    <Ionicons name="eye-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.pdfViewBtnText}>PDF Aç</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.pdfDeleteBtn}
                    onPress={handleDeletePdf}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.pdfAttachBtn}
                  onPress={handleUploadPdf}
                  activeOpacity={0.8}
                  disabled={loadingPdf}
                >
                  <Ionicons name="document-attach-outline" size={17} color={Colors.primary} />
                  <Text style={styles.pdfAttachBtnText}>
                    {loadingPdf ? 'PDF Yükleniyor...' : 'Yıllık Planın Orijinal PDF Halini Sakla / Yükle'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="calendar-outline"
            title={`${selectedGradeLevel}. Sınıf Planı Bulunmuyor`}
            description={`Bu ders ve sınıf düzeyi için henüz haftalık müfredat planı yüklenmemiş. Hazır Excel dosyanızı tek tıkla yükleyebilirsiniz.`}
            actionTitle="Excel ile Yükle"
            onAction={handleOpenBulkModal}
          />
        }
        renderItem={({ item }) => {
          const isCurrentWeek =
            item.date_start && item.date_end && item.date_start <= today && item.date_end >= today;

          return (
            <Card
              style={[styles.planCard, isCurrentWeek ? styles.planCardActive : null]}
              highlightBorder={isCurrentWeek ? Colors.success : Colors.primary}
            >
              <View style={styles.cardHeader}>
                <View style={styles.weekBadge}>
                  <Text style={styles.weekText}>{item.week_number}. Hafta</Text>
                </View>

                <View style={styles.gradeBadge}>
                  <Text style={styles.gradeBadgeText}>
                    {item.grade_level || selectedGradeLevel}. Sınıf
                  </Text>
                </View>

                {item.lesson_hours ? (
                  <View style={styles.hoursPill}>
                    <Text style={styles.hoursPillText}>{item.lesson_hours} Saat</Text>
                  </View>
                ) : null}

                {isCurrentWeek ? (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>Bu Hafta (Aktif)</Text>
                  </View>
                ) : null}

                <View style={styles.actions}>
                  <TouchableOpacity
                    onPress={() => handleOpenEdit(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="pencil" size={16} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.topicTitle}>{item.subject_topic}</Text>

              {item.learning_outcomes ? (
                <Text style={styles.outcomesText}>{item.learning_outcomes}</Text>
              ) : null}

              {(item.date_start || item.date_end) && (
                <View style={styles.dateRow}>
                  <Ionicons name="calendar-outline" size={13} color={Colors.textSecondary} />
                  <Text style={styles.dateText}>
                    {formatDateToTR(item.date_start)} - {formatDateToTR(item.date_end)}
                  </Text>
                </View>
              )}
            </Card>
          );
        }}
      />

      {/* BULK EXCEL IMPORT MODAL */}
      <Modal visible={bulkModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {selectedGradeLevel}. Sınıf Yıllık Plan Yükle
                </Text>
                <Text style={styles.modalSub}>
                  {activeCourseObj?.name} • Haftalık {scheduleInfo?.totalWeeklyHours || 4} Saat
                </Text>
              </View>
              <TouchableOpacity onPress={() => setBulkModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {loadingExcel ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.loadingText}>İşleniyor, lütfen bekleyiniz...</Text>
                </View>
              ) : parsedRows.length === 0 ? (
                <View>
                  <View style={styles.guideCard}>
                    <Text style={styles.guideStepTitle}>Adım 1: Hazır Şablonu İndirin</Text>
                    <Text style={styles.guideStepDesc}>
                      Ders programınızdaki haftalık {scheduleInfo?.totalWeeklyHours || 4} saatlik dağılıma göre hazırlanmış hazır Excel şablonudur.
                    </Text>
                    <TouchableOpacity
                      style={styles.templateDownloadBtn}
                      onPress={handleDownloadTemplate}
                    >
                      <Ionicons name="download-outline" size={16} color={Colors.primary} />
                      <Text style={styles.templateDownloadBtnText}>
                        {selectedGradeLevel}. Sınıf Şablonunu İndir (.xlsx)
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.guideCard, { marginTop: 12 }]}>
                    <Text style={styles.guideStepTitle}>Adım 2: Excel Dosyasını Yükleyin</Text>
                    <Text style={styles.guideStepDesc}>
                      1. sütunda başlangıç tarihi, 2. sütunda bitiş tarihi, 3. sütunda ders saati ve 4. sütunda deftere yazılacak konu olan Excel dosyanızı seçin.
                    </Text>
                    <TouchableOpacity
                      style={styles.pickExcelBtn}
                      onPress={handlePickExcel}
                    >
                      <Ionicons name="folder-open-outline" size={20} color="#fff" />
                      <Text style={styles.pickExcelBtnText}>Excel Dosyası Seç</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View>
                  <View style={styles.previewHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="checkmark-circle" size={18} color="#059669" />
                      <Text style={styles.previewTitle}>
                        Toplam {parsedRows.length} Ders Konusu / Saati Dağıtıldı
                      </Text>
                    </View>
                    <Text style={styles.previewSub}>
                      {selectedGradeLevel}. Sınıf ({scheduleInfo?.distinctClasses.join(', ')}) şubelerinin tamamında ders saatlerine göre homojen dağıtılmıştır.
                    </Text>
                  </View>

                  <Text style={styles.previewListTitle}>
                    Plan Önizlemesi (İlk {Math.min(parsedRows.length, 6)} Ders Bölümü):
                  </Text>
                  {parsedRows.slice(0, 6).map((r, idx) => (
                    <View key={`${r.weekNumber}-${idx}`} style={styles.previewItemCard}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.previewItemWeek}>{r.weekNumber}. Hafta</Text>
                        <View style={styles.previewHoursPill}>
                          <Text style={styles.previewHoursPillText}>{r.lessonHours} Saat</Text>
                        </View>
                      </View>
                      <Text style={styles.previewItemTopic}>{r.subjectTopic}</Text>
                      <Text style={styles.previewItemDates}>
                        {formatDateToTR(r.dateStart)} — {formatDateToTR(r.dateEnd)}
                      </Text>
                    </View>
                  ))}
                  {parsedRows.length > 6 && (
                    <Text style={styles.moreWeeksText}>
                      ... ve diğer {parsedRows.length - 6} ders konusu
                    </Text>
                  )}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title={parsedRows.length > 0 ? 'Geri' : 'Kapat'}
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => {
                  if (parsedRows.length > 0) {
                    setParsedRows([]);
                  } else {
                    setBulkModalVisible(false);
                  }
                }}
              />
              {parsedRows.length > 0 && (
                <Button
                  title={`Onayla ve Kaydet (${parsedRows.length} Hafta)`}
                  style={{ flex: 2 }}
                  onPress={handleConfirmBulkSave}
                  loading={loadingExcel}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* SINGLE ADD / EDIT PLAN MODAL */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingPlan ? 'Müfredat Konusunu Düzenle' : 'Yeni Konu Ekle'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Hafta No *"
                    placeholder="Örn: 3"
                    value={formWeek}
                    onChangeText={setFormWeek}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Ders Saati (Zorunlu) *"
                    placeholder="Örn: 2"
                    value={formLessonHours}
                    onChangeText={setFormLessonHours}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 12, marginTop: -4 }}>
                💡 Bir haftada birden fazla konu varsa aynı hafta numarasıyla konuları sırayla ekleyebilirsiniz (Örn: Kuvvet 2 saat, Hareket 2 saat).
              </Text>

              <Input
                label="Deftere Yazılacak Konu *"
                placeholder="Örn: Vektörler ve Kuvvet Dengesi"
                value={formTopic}
                onChangeText={setFormTopic}
              />

              <Input
                label="Kazanımlar / Açıklama (Opsiyonel)"
                placeholder="Örn: İki boyutlu kartezyen koordinat sisteminde..."
                value={formOutcomes}
                onChangeText={setFormOutcomes}
                multiline
                numberOfLines={2}
              />

              <View style={styles.datesRow}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Başlangıç Tarihi"
                    placeholder="YYYY-AA-GG"
                    value={formStartDate}
                    onChangeText={setFormStartDate}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Bitiş Tarihi"
                    placeholder="YYYY-AA-GG"
                    value={formEndDate}
                    onChangeText={setFormEndDate}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setModalVisible(false)}
              />
              <Button title="Kaydet" style={{ flex: 1 }} onPress={handleSave} />
            </View>
          </View>
        </View>
      </Modal>

      {/* PDF IN-APP VIEWER MODAL */}
      <PdfViewerModal
        visible={pdfViewerModalVisible}
        onClose={() => setPdfViewerModalVisible(false)}
        fileUri={pdfDoc?.file_uri || null}
        fileName={pdfDoc?.file_name}
        title={`${selectedGradeLevel}. Sınıf ${courses.find((c) => c.id === selectedCourseId)?.name || 'Ders'} Yıllık Planı`}
        onShareOrExternal={() => {
          if (pdfDoc) {
            const activeCourse = courses.find((c) => c.id === selectedCourseId);
            const courseTitle = activeCourse ? activeCourse.name : 'Ders';
            viewYearlyPlanPdf(
              pdfDoc.file_uri,
              `${selectedGradeLevel}. Sınıf ${courseTitle} Yıllık Planı`
            );
          }
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  levelBar: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  levelBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  levelBarLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  manageLevelsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  manageLevelsBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  levelScroll: {
    gap: 8,
  },
  levelChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  levelChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  levelChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  levelChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  courseChipsBar: {
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.primaryDark,
    fontWeight: '700',
  },
  listHeaderWrapper: {
    paddingBottom: 4,
  },
  statusSection: {
    paddingTop: 8,
  },
  verifiedScheduleCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verifiedIconWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  hoursBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  hoursBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
  },
  verifiedSub: {
    fontSize: 11,
    color: '#166534',
    marginTop: 2,
  },
  warningScheduleCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 10,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  warningTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  warningSub: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 1,
    lineHeight: 15,
  },
  goToScheduleBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  goToScheduleBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  actionStrip: {
    flexDirection: 'row',
    paddingVertical: 10,
    gap: 8,
  },
  actionStripBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 6,
  },
  actionStripBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  actionStripSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 5,
  },
  actionStripSecondaryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  pdfSectionContainer: {
    paddingBottom: 8,
  },
  pdfBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 10,
  },
  pdfIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },
  pdfBannerSub: {
    fontSize: 11,
    color: '#B91C1C',
    marginTop: 1,
  },
  pdfViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 4,
  },
  pdfViewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pdfDeleteBtn: {
    padding: 6,
  },
  pdfAttachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  pdfAttachBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  previewHoursPill: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  previewHoursPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
    paddingBottom: 32,
  },
  planCard: {
    padding: 14,
    marginBottom: 10,
  },
  planCardActive: {
    backgroundColor: '#F0FDF4',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  weekBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  weekText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  gradeBadge: {
    backgroundColor: Colors.cardSubtle,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gradeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  hoursPill: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  hoursPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  currentBadge: {
    backgroundColor: Colors.successLight,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.successDark,
  },
  actions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    gap: 12,
  },
  topicTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  outcomesText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
    lineHeight: 17,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dateText: {
    fontSize: 11,
    color: Colors.textMuted,
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
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  datesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  guideCard: {
    backgroundColor: Colors.cardSubtle,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  guideStepTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  guideStepDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginBottom: 8,
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
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  pickExcelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 11,
    borderRadius: 8,
    gap: 6,
  },
  pickExcelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  previewHeader: {
    backgroundColor: '#ECFDF5',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 12,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065F46',
  },
  previewSub: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
  },
  previewListTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  previewItemCard: {
    backgroundColor: Colors.cardSubtle,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  previewItemWeek: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  previewItemHours: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  previewItemTopic: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  previewItemDates: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  moreWeeksText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 8,
  },
});
