import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Image,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '../theme/colors';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { getClasses } from '../database/operations/classOperations';
import {
  getAllStudentsWithClass,
  StudentWithClass,
  bulkCreateStudentsMultipleClasses,
  createStudent,
  updateStudentPhoto,
} from '../database/operations/studentOperations';
import { getGradeLevels } from '../database/operations/gradeLevelOperations';
import { getAssignments } from '../database/operations/assignmentOperations';
import { getAllNotes } from '../database/operations/noteOperations';
import { getFullClassGradebook } from '../database/operations/gradeOperations';
import { getLessonSlots, getWeeklySchedule } from '../database/operations/scheduleOperations';
import {
  generateStudentTemplateExcel,
  exportScheduleToExcel,
  pickAndParseStudentsExcel,
  validateBulkStudentImport,
  exportCustomStudentsReport,
  exportCustomNotesReport,
  exportCustomGradebookReport,
  exportCustomAssignmentsReport,
} from '../utils/excelService';
import { savePhotoPermanently } from '../utils/photoService';
import {
  extractPhotosFromPdf,
  PdfExtractedStudentPhoto,
} from '../utils/pdfPhotoExtractor';
import { ClassItem, StudentNote, Assignment, GradeLevelItem, Student } from '../types';
import { formatDateToTR } from '../utils/dateUtils';
import { useSchoolTheme } from '../context/SchoolThemeContext';

type ReportType = 'students' | 'gradebook' | 'notes' | 'assignments';

export const ReportsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { bgTint } = useSchoolTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Database Data
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [allStudents, setAllStudents] = useState<StudentWithClass[]>([]);
  const [systemGradeLevels, setSystemGradeLevels] = useState<GradeLevelItem[]>([]);

  // Filter Modal State
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [activeReportType, setActiveReportType] = useState<ReportType>('students');
  const [selectedGradeLevel, setSelectedGradeLevel] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<number | 'all'>('all');
  const [selectedTerm, setSelectedTerm] = useState<1 | 2>(1);
  const [studentSelectionMode, setStudentSelectionMode] = useState<'all' | 'custom'>('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [studentSearchText, setStudentSearchText] = useState('');

  // Manual Student Add Modal State
  const [manualStudentModalVisible, setManualStudentModalVisible] = useState(false);
  const [manualClassId, setManualClassId] = useState<number | null>(null);
  const [manualStudentNo, setManualStudentNo] = useState('');
  const [manualFirstName, setManualFirstName] = useState('');
  const [manualLastName, setManualLastName] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [savingManualStudent, setSavingManualStudent] = useState(false);

  // PDF Photo Extraction Modal State
  const [pdfPhotoModalVisible, setPdfPhotoModalVisible] = useState(false);
  const [pdfExtractItems, setPdfExtractItems] = useState<PdfExtractedStudentPhoto[]>([]);
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [savingPdfPhotos, setSavingPdfPhotos] = useState(false);

  // Load Data
  const loadData = async () => {
    try {
      const [fetchedClasses, fetchedStudents, fetchedGradeLevels] = await Promise.all([
        getClasses(),
        getAllStudentsWithClass(),
        getGradeLevels(),
      ]);
      setClasses(fetchedClasses);
      setAllStudents(fetchedStudents);
      setSystemGradeLevels(fetchedGradeLevels);
    } catch (e) {
      console.warn('Error loading reporting data:', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // Extract distinct grade levels (from settings, classes and students)
  const gradeLevels = useMemo(() => {
    const levels = new Set<string>();
    systemGradeLevels.forEach((g) => levels.add(String(g.level)));
    classes.forEach((c) => {
      if (c.grade_level) {
        levels.add(String(c.grade_level));
      } else {
        const match = c.name.match(/^(\d{1,2})/);
        if (match) {
          levels.add(match[1]);
        }
      }
    });
    allStudents.forEach((s) => {
      if (s.grade_level) {
        levels.add(String(s.grade_level));
      }
    });
    return Array.from(levels).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [systemGradeLevels, classes, allStudents]);

  // Filter classes by grade level
  const displayedClasses = useMemo(() => {
    if (selectedGradeLevel === 'all') return classes;
    const targetLvl = parseInt(selectedGradeLevel, 10);
    return classes.filter(
      (c) =>
        c.grade_level === targetLvl ||
        c.name.startsWith(selectedGradeLevel) ||
        c.name.startsWith(`${selectedGradeLevel}-`) ||
        c.name.startsWith(`${selectedGradeLevel}/`)
    );
  }, [classes, selectedGradeLevel]);

  // Filter candidate students according to class and grade level selections
  const candidateStudents = useMemo(() => {
    let list = allStudents;
    if (selectedClassId !== 'all') {
      list = list.filter((s) => s.class_id === selectedClassId);
    } else if (selectedGradeLevel !== 'all') {
      const targetLvl = parseInt(selectedGradeLevel, 10);
      list = list.filter(
        (s) =>
          s.grade_level === targetLvl ||
          (s.class_name &&
            (s.class_name.startsWith(selectedGradeLevel) ||
              s.class_name.startsWith(`${selectedGradeLevel}-`) ||
              s.class_name.startsWith(`${selectedGradeLevel}/`)))
      );
    }

    if (studentSearchText.trim()) {
      const q = studentSearchText.toLowerCase().trim();
      list = list.filter(
        (s) =>
          (s.full_name && s.full_name.toLowerCase().includes(q)) ||
          (s.first_name && s.first_name.toLowerCase().includes(q)) ||
          (s.last_name && s.last_name.toLowerCase().includes(q)) ||
          (s.student_number && s.student_number.includes(q))
      );
    }

    return list;
  }, [allStudents, selectedClassId, selectedGradeLevel, studentSearchText]);

  // Open Modal with defaults
  const openReportModal = (type: ReportType) => {
    setActiveReportType(type);
    setSelectedGradeLevel('all');
    setSelectedClassId('all');
    setSelectedTerm(1);
    setStudentSelectionMode('all');
    setSelectedStudentIds([]);
    setStudentSearchText('');
    setFilterModalVisible(true);
  };

  // Toggle student selection
  const toggleStudent = (id: number) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Select all candidate students
  const selectAllCandidates = () => {
    const ids = candidateStudents.map((s) => s.id);
    setSelectedStudentIds(ids);
  };

  // Clear candidate selection
  const clearCandidateSelection = () => {
    setSelectedStudentIds([]);
  };

  // Handle Generate Report
  const handleGenerateReport = async () => {
    if (classes.length === 0) {
      Alert.alert('Bilgi', 'Sistemde henüz kayıtlı şube bulunmuyor.');
      return;
    }

    try {
      setGenerating(true);

      // Determine target classes
      let targetClasses = classes;
      if (selectedClassId !== 'all') {
        targetClasses = classes.filter((c) => c.id === selectedClassId);
      } else if (selectedGradeLevel !== 'all') {
        const targetLvl = parseInt(selectedGradeLevel, 10);
        targetClasses = classes.filter(
          (c) =>
            c.grade_level === targetLvl ||
            c.name.startsWith(selectedGradeLevel) ||
            c.name.startsWith(`${selectedGradeLevel}-`) ||
            c.name.startsWith(`${selectedGradeLevel}/`)
        );
      }

      if (targetClasses.length === 0) {
        Alert.alert('Uyarı', 'Seçili kriterlere uygun şube bulunamadı.');
        return;
      }

      // 1. ÖĞRENCİ LİSTESİ
      if (activeReportType === 'students') {
        const payload: Array<{ className: string; students: any[] }> = [];

        for (const c of targetClasses) {
          let classStudents = allStudents.filter((s) => s.class_id === c.id);
          if (studentSelectionMode === 'custom') {
            classStudents = classStudents.filter((s) => selectedStudentIds.includes(s.id));
          }
          if (classStudents.length > 0) {
            payload.push({
              className: c.name,
              students: classStudents,
            });
          }
        }

        if (payload.length === 0) {
          Alert.alert('Uyarı', 'Rapor için seçilen kriterlere uyan öğrenci bulunamadı.');
          return;
        }

        const reportTitle =
          selectedClassId !== 'all'
            ? `${targetClasses[0].name} Şubesi Öğrenci Listesi`
            : selectedGradeLevel !== 'all'
              ? `${selectedGradeLevel}. Sınıflar Öğrenci Listesi`
              : 'Tüm Şubeler Öğrenci Listesi';

        await exportCustomStudentsReport(reportTitle, payload);
        setFilterModalVisible(false);
      }

      // 2. NOT ÇİZELGESİ & SINAVLAR
      else if (activeReportType === 'gradebook') {
        const classGradebooks: Array<{
          className: string;
          term: number;
          gradebook: any;
        }> = [];

        for (const c of targetClasses) {
          const fullGradebook = await getFullClassGradebook(c.id, selectedTerm);
          let studs = fullGradebook.students;
          if (studentSelectionMode === 'custom') {
            studs = studs.filter((s) => selectedStudentIds.includes(s.student_id));
          }

          if (studs.length > 0) {
            classGradebooks.push({
              className: c.name,
              term: selectedTerm,
              gradebook: {
                students: studs,
                quizzes: fullGradebook.quizzes,
              },
            });
          }
        }

        if (classGradebooks.length === 0) {
          Alert.alert('Uyarı', 'Rapor için seçilen kriterlere uyan öğrenci not kaydı bulunamadı.');
          return;
        }

        await exportCustomGradebookReport(classGradebooks);
        setFilterModalVisible(false);
      }

      // 3. ÖĞRENCİ GÖRÜŞ & DEĞERLENDİRME
      else if (activeReportType === 'notes') {
        const allNotesList = await getAllNotes();
        let filteredNotes = allNotesList;

        if (selectedClassId !== 'all') {
          filteredNotes = filteredNotes.filter((n) => n.class_id === selectedClassId);
        } else if (selectedGradeLevel !== 'all') {
          filteredNotes = filteredNotes.filter(
            (n) => n.class_name && n.class_name.startsWith(selectedGradeLevel)
          );
        }

        if (studentSelectionMode === 'custom') {
          filteredNotes = filteredNotes.filter((n) => selectedStudentIds.includes(n.student_id));
        }

        if (filteredNotes.length === 0) {
          Alert.alert(
            'Kayıt Bulunamadı',
            'Seçtiğiniz sınıf, şube veya öğrenci kriterlerine uygun öğrenci görüşü bulunamadı.'
          );
          return;
        }

        let scopeTitle = 'Tüm Şubeler';
        if (selectedClassId !== 'all') {
          scopeTitle = targetClasses[0].name;
        } else if (selectedGradeLevel !== 'all') {
          scopeTitle = `${selectedGradeLevel}. Sınıflar`;
        }

        if (studentSelectionMode === 'custom') {
          scopeTitle += ` (${selectedStudentIds.length} Seçili Öğrenci)`;
        }

        await exportCustomNotesReport(filteredNotes, scopeTitle);
        setFilterModalVisible(false);
      }

      // 4. ÖDEV TAKİP RAPORU
      else if (activeReportType === 'assignments') {
        const allAssignments = await getAssignments();
        let filteredAssignments = allAssignments;

        if (selectedClassId !== 'all') {
          filteredAssignments = filteredAssignments.filter((a) => a.class_id === selectedClassId);
        } else if (selectedGradeLevel !== 'all') {
          filteredAssignments = filteredAssignments.filter(
            (a) => a.class_name && a.class_name.startsWith(selectedGradeLevel)
          );
        }

        if (filteredAssignments.length === 0) {
          Alert.alert('Kayıt Bulunamadı', 'Seçilen kriterlere uygun ödev kaydı bulunamadı.');
          return;
        }

        let scopeTitle = 'Tüm Şubeler';
        if (selectedClassId !== 'all') {
          scopeTitle = targetClasses[0].name;
        } else if (selectedGradeLevel !== 'all') {
          scopeTitle = `${selectedGradeLevel}. Sınıflar`;
        }

        await exportCustomAssignmentsReport(filteredAssignments, scopeTitle);
        setFilterModalVisible(false);
      }
    } catch (e: any) {
      Alert.alert('Hata', 'Rapor oluşturulurken bir sorun oluştu: ' + (e?.message || e));
    } finally {
      setGenerating(false);
    }
  };

  // Direct Weekly Schedule Export
  const handleExportSchedule = async () => {
    try {
      setLoading(true);
      const slots = await getLessonSlots();
      const schedule = await getWeeklySchedule();
      await exportScheduleToExcel(slots, schedule);
    } catch (e) {
      Alert.alert('Hata', 'Ders programı oluşturulamadı.');
    } finally {
      setLoading(false);
    }
  };

  // Template Download
  const handleDownloadTemplate = async () => {
    try {
      setLoading(true);
      await generateStudentTemplateExcel();
    } catch (e: any) {
      Alert.alert('Hata', 'Şablon dosyası oluşturulamadı: ' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Bulk Student Import
  const handleBulkImportStudents = async () => {
    try {
      setLoading(true);
      const parsed = await pickAndParseStudentsExcel();
      if (parsed.length === 0) {
        setLoading(false);
        return;
      }

      if (classes.length === 0) {
        setLoading(false);
        Alert.alert(
          'Kayıtlı Şube Yok',
          'Sistemde henüz kayıtlı şube bulunmamaktadır. Lütfen önce "Şubeler" ekranından şubelerinizi oluşturunuz.'
        );
        return;
      }

      const val = validateBulkStudentImport(parsed, classes);

      if (val.validCount === 0) {
        setLoading(false);
        let errorMsg = 'Excel dosyasındaki şube adları sistemdeki şubelerle eşleşmedi.';
        if (val.unmatchedClasses.length > 0) {
          errorMsg +=
            '\n\nBulunamayan Şubeler:\n' + val.unmatchedClasses.map((u) => `• ${u.rawClassName}`).join('\n');
        }
        errorMsg += '\n\nLütfen şablondaki "Kayıtlı Şubeler" sayfasındaki isimleri birebir aynı şekilde kullanınız.';
        Alert.alert('Geçersiz Şube Girişi', errorMsg);
        return;
      }

      let message =
        `Toplam ${val.totalStudents} öğrenci tespit edildi.\n\nEşleşen Şubeler:\n` +
        val.validPayloads.map((p) => `• ${p.className}: ${p.students.length} öğrenci`).join('\n');

      if (val.unmatchedClasses.length > 0) {
        message +=
          '\n\n⚠️ Bulunamayan ve Atlanacak Şubeler:\n' +
          val.unmatchedClasses.map((u) => `• ${u.rawClassName}: ${u.count} öğrenci`).join('\n');
      }

      Alert.alert(
        'Toplu Öğrenci Yükleme',
        message + `\n\n${val.validCount} öğrenci sisteme kaydedilsin mi?`,
        [
          { text: 'Vazgeç', style: 'cancel', onPress: () => setLoading(false) },
          {
            text: 'Onayla ve Yükle',
            onPress: async () => {
              try {
                const res = await bulkCreateStudentsMultipleClasses(val.validPayloads);
                loadData();
                Alert.alert(
                  'Başarılı',
                  `Toplam ${res.totalAdded} öğrenci şubelerine başarıyla eklendi!`
                );
              } catch (e: any) {
                Alert.alert('Hata', 'Yükleme sırasında hata oluştu: ' + (e?.message || e));
              } finally {
                setLoading(false);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      setLoading(false);
      Alert.alert('Hata', e?.message || 'Excel dosyası okunamadı.');
    }
  };

  // Manual Student Add Handlers
  const handleOpenManualAddStudent = () => {
    if (classes.length === 0) {
      Alert.alert(
        'Kayıtlı Şube Yok',
        'Öğrenci eklemek için önce Şubeler ekranından en az bir şube tanımlamanız gerekmektedir.'
      );
      return;
    }
    setManualClassId(classes[0].id);
    setManualStudentNo('');
    setManualFirstName('');
    setManualLastName('');
    setManualNotes('');
    setManualStudentModalVisible(true);
  };

  const handleSaveManualStudent = async () => {
    if (!manualClassId) {
      Alert.alert('Uyarı', 'Lütfen bir şube seçiniz.');
      return;
    }
    if (!manualStudentNo.trim()) {
      Alert.alert('Uyarı', 'Lütfen okul numarasını giriniz.');
      return;
    }
    if (!manualFirstName.trim()) {
      Alert.alert('Uyarı', 'Lütfen öğrenci adını giriniz.');
      return;
    }

    try {
      setSavingManualStudent(true);
      await createStudent(
        manualClassId,
        manualStudentNo,
        manualFirstName,
        manualLastName,
        manualNotes
      );
      setManualStudentModalVisible(false);
      setManualStudentNo('');
      setManualFirstName('');
      setManualLastName('');
      setManualNotes('');
      await loadData();
      Alert.alert('Başarılı', `${manualFirstName.trim()} ${manualLastName.trim()} başarıyla kaydedildi.`);
    } catch (e: any) {
      Alert.alert('Hata', 'Öğrenci kaydedilirken bir hata oluştu: ' + (e?.message || e));
    } finally {
      setSavingManualStudent(false);
    }
  };

  // PDF Photo Handlers
  const handleStartPdfPhoto = () => {
    if (allStudents.length === 0) {
      Alert.alert('Bilgi', 'Sistemde kayıtlı öğrenci bulunmuyor. Önce öğrencileri sisteme yükleyiniz.');
      return;
    }

    Alert.alert(
      'PDF\'ten Fotoğraf Aktar',
      'e-Okul sınıf listesi PDF\'inden vesikalık fotoğraflar taranacak ve okul numarasına göre öğrencilerle eşleştirilecektir.\n\nİşlem kapsamını seçiniz:',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Tüm Okul Öğrencileri',
          onPress: () => runPdfExtraction(allStudents as any),
        },
      ]
    );
  };

  const runPdfExtraction = async (targetStudents: Student[]) => {
    try {
      setPdfExtracting(true);
      const res = await extractPhotosFromPdf(targetStudents);
      if (!res.success) {
        if (res.error && res.error !== 'Dosya seçilmedi.') {
          Alert.alert('Hata', res.error);
        }
        return;
      }
      if (res.extractedPhotos.length === 0) {
        Alert.alert('Bilgi', 'PDF içinde uygun vesikalık fotoğraf bulunamadı.');
        return;
      }
      setPdfExtractItems(res.extractedPhotos);
      setPdfPhotoModalVisible(true);
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'PDF işlenemedi.');
    } finally {
      setPdfExtracting(false);
    }
  };

  const handleConfirmSavePdfPhotos = async () => {
    const toSave = pdfExtractItems.filter((item) => item.matchedStudent !== null);
    if (toSave.length === 0) {
      Alert.alert('Uyarı', 'Eşleşen öğrenci bulunamadı.');
      return;
    }
    setSavingPdfPhotos(true);
    try {
      let savedCount = 0;
      for (const item of toSave) {
        if (!item.matchedStudent) continue;
        const permanentUri = await savePhotoPermanently(
          item.tempUri,
          item.matchedStudent.student_number || item.matchedStudent.id
        );
        await updateStudentPhoto(item.matchedStudent.id, permanentUri);
        savedCount++;
      }
      setPdfPhotoModalVisible(false);
      setPdfExtractItems([]);
      await loadData();
      Alert.alert(
        'Başarılı 🎉',
        `PDF'ten toplam ${savedCount} öğrenci fotoğrafı başarıyla yüklendi ve öğrencilere atandı!`
      );
    } catch (e: any) {
      Alert.alert('Hata', 'Fotoğraflar kaydedilirken bir hata oluştu: ' + (e?.message || e));
    } finally {
      setSavingPdfPhotos(false);
    }
  };

  const handleUpdatePdfMatchStudent = (index: number, student: Student | null) => {
    setPdfExtractItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], matchedStudent: student };
      return copy;
    });
  };

  // Helper for Report Details in Modal
  const getReportMeta = () => {
    switch (activeReportType) {
      case 'students':
        return {
          title: 'Öğrenci Listesi Raporu',
          desc: 'Sınıf düzeyi, şube ve dilediğiniz öğrencileri seçerek liste oluşturun.',
          icon: 'people' as const,
          color: Colors.primary,
          bgColor: Colors.primaryLight,
        };
      case 'gradebook':
        return {
          title: 'Not Çizelgesi & Sınavlar Raporu',
          desc: '1. ve 2. Dönem yazılı sınavlar, quizler, performanslar ve ortalamalar.',
          icon: 'school' as const,
          color: '#7C3AED',
          bgColor: '#EDE9FE',
        };
      case 'notes':
        return {
          title: 'Öğrenci Görüş & Değerlendirme Raporu',
          desc: 'Tarih, ders ve öğrenci bazında tutulan tüm görüş ve gözlem notları.',
          icon: 'chatbubbles' as const,
          color: Colors.secondary,
          bgColor: Colors.secondaryLight,
        };
      case 'assignments':
        return {
          title: 'Ödev Takip & Sonuç Raporu',
          desc: 'Verilen ödevlerin teslim oranları, yapıldı/yapılmadı istatistikleri.',
          icon: 'document-text' as const,
          color: Colors.warningDark,
          bgColor: Colors.warningLight,
        };
    }
  };

  const meta = getReportMeta();
  const { activeSchool } = useSchoolTheme();

  return (
    <View style={[styles.mainContainer, { backgroundColor: bgTint }]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={styles.headerTitle}>Raporlama & Excel Merkezi</Text>
            {activeSchool && (
              <View style={{ backgroundColor: `${activeSchool.color || Colors.primary}20`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: activeSchool.color || Colors.primary }}>
                  {activeSchool.name}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.headerSub}>
            {activeSchool ? `"${activeSchool.name}" okuluna ait ` : ''}sınıf, şube, öğrenci ve değerlendirme verilerinizi filtreleyip Excel (.xlsx) olarak dışa aktarın.
          </Text>
        </View>

        {loading && (
          <View style={styles.loadingBanner}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.loadingText}>İşlem yapılıyor...</Text>
          </View>
        )}

        {/* 1. ÖĞRENCİ LİSTELERİ */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => openReportModal('students')}
          disabled={loading}
        >
          <Card style={styles.reportCard}>
            <View style={styles.cardRow}>
              <View style={[styles.iconWrap, { backgroundColor: Colors.primaryLight }]}>
                <Ionicons name="people" size={26} color={Colors.primary} />
              </View>
              <View style={styles.cardTextWrap}>
                <View style={styles.titleRow}>
                  <Text style={styles.reportTitle}>Öğrenci Listeleri</Text>
                  <View style={[styles.badge, { backgroundColor: Colors.primaryLight }]}>
                    <Text style={[styles.badgeText, { color: Colors.primary }]}>Filtrelenebilir</Text>
                  </View>
                </View>
                <Text style={styles.reportDesc}>
                  Sınıf düzeyi, şube ve özel öğrenci seçimiyle anında çok sayfalı Excel listesi oluşturun.
                </Text>
              </View>
              <View style={[styles.actionChip, { backgroundColor: Colors.primaryLight }]}>
                <Ionicons name="options-outline" size={16} color={Colors.primary} />
                <Text style={[styles.actionChipText, { color: Colors.primary }]}>Filtrele</Text>
              </View>
            </View>
          </Card>
        </TouchableOpacity>

        {/* 2. NOT ÇİZELGESİ & SINAVLAR */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => openReportModal('gradebook')}
          disabled={loading}
        >
          <Card style={styles.reportCard}>
            <View style={styles.cardRow}>
              <View style={[styles.iconWrap, { backgroundColor: '#EDE9FE' }]}>
                <Ionicons name="school" size={26} color="#7C3AED" />
              </View>
              <View style={styles.cardTextWrap}>
                <View style={styles.titleRow}>
                  <Text style={styles.reportTitle}>Not Çizelgesi & Sınavlar</Text>
                  <View style={[styles.badge, { backgroundColor: '#EDE9FE' }]}>
                    <Text style={[styles.badgeText, { color: '#7C3AED' }]}>1. & 2. Dönem</Text>
                  </View>
                </View>
                <Text style={styles.reportDesc}>
                  3 yazılı, 3 performans, sınırsız quiz ve dönem ortalamalarını içeren not çizelgesi.
                </Text>
              </View>
              <View style={[styles.actionChip, { backgroundColor: '#EDE9FE' }]}>
                <Ionicons name="options-outline" size={16} color="#7C3AED" />
                <Text style={[styles.actionChipText, { color: '#7C3AED' }]}>Filtrele</Text>
              </View>
            </View>
          </Card>
        </TouchableOpacity>

        {/* 3. ÖĞRENCİ GÖRÜŞ & GÖZLEM RAPORU */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => openReportModal('notes')}
          disabled={loading}
        >
          <Card style={styles.reportCard}>
            <View style={styles.cardRow}>
              <View style={[styles.iconWrap, { backgroundColor: Colors.secondaryLight }]}>
                <Ionicons name="chatbubbles" size={26} color={Colors.secondary} />
              </View>
              <View style={styles.cardTextWrap}>
                <View style={styles.titleRow}>
                  <Text style={styles.reportTitle}>Öğrenci Görüş Raporu</Text>
                  <View style={[styles.badge, { backgroundColor: Colors.secondaryLight }]}>
                    <Text style={[styles.badgeText, { color: Colors.secondary }]}>Gözlemler</Text>
                  </View>
                </View>
                <Text style={styles.reportDesc}>
                  Sınıf düzeyi, şube veya öğrenci bazında tarih ve ders bilgisiyle tutulan tüm değerlendirmeler.
                </Text>
              </View>
              <View style={[styles.actionChip, { backgroundColor: Colors.secondaryLight }]}>
                <Ionicons name="options-outline" size={16} color={Colors.secondary} />
                <Text style={[styles.actionChipText, { color: Colors.secondary }]}>Filtrele</Text>
              </View>
            </View>
          </Card>
        </TouchableOpacity>

        {/* 4. ÖDEV TAKİP RAPORU */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => openReportModal('assignments')}
          disabled={loading}
        >
          <Card style={styles.reportCard}>
            <View style={styles.cardRow}>
              <View style={[styles.iconWrap, { backgroundColor: Colors.warningLight }]}>
                <Ionicons name="document-text" size={26} color={Colors.warningDark} />
              </View>
              <View style={styles.cardTextWrap}>
                <View style={styles.titleRow}>
                  <Text style={styles.reportTitle}>Ödev Takip & Sonuç Raporu</Text>
                  <View style={[styles.badge, { backgroundColor: Colors.warningLight }]}>
                    <Text style={[styles.badgeText, { color: Colors.warningDark }]}>İstatistikler</Text>
                  </View>
                </View>
                <Text style={styles.reportDesc}>
                  Verilen ödevlerin teslim durumu, yapılma oranları ve şube bazlı başarı analizleri.
                </Text>
              </View>
              <View style={[styles.actionChip, { backgroundColor: Colors.warningLight }]}>
                <Ionicons name="options-outline" size={16} color={Colors.warningDark} />
                <Text style={[styles.actionChipText, { color: Colors.warningDark }]}>Filtrele</Text>
              </View>
            </View>
          </Card>
        </TouchableOpacity>

        {/* 5. HAFTALIK DERS PROGRAMI */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleExportSchedule}
          disabled={loading}
        >
          <Card style={styles.reportCard}>
            <View style={styles.cardRow}>
              <View style={[styles.iconWrap, { backgroundColor: Colors.successLight }]}>
                <Ionicons name="calendar" size={26} color={Colors.successDark} />
              </View>
              <View style={styles.cardTextWrap}>
                <View style={styles.titleRow}>
                  <Text style={styles.reportTitle}>Haftalık Ders Programı</Text>
                  <View style={[styles.badge, { backgroundColor: Colors.successLight }]}>
                    <Text style={[styles.badgeText, { color: Colors.successDark }]}>Tek Tıkla</Text>
                  </View>
                </View>
                <Text style={styles.reportDesc}>
                  Pazartesi - Cuma haftalık ders saatleri ve şube dağılım matrisini Excel olarak indirin.
                </Text>
              </View>
              <Ionicons name="download-outline" size={22} color={Colors.successDark} />
            </View>
          </Card>
        </TouchableOpacity>

        {/* 6. ŞUBE & ÖĞRENCİ İŞLEMLERİ */}
        <View style={styles.templateSection}>
          <Text style={styles.sectionHeader}>Şube & Öğrenci İşlemleri</Text>

          {/* 1. Manuel Öğrenci Ekle */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleOpenManualAddStudent}
            disabled={loading}
          >
            <Card style={[styles.reportCard, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0', borderWidth: 1 }]}>
              <View style={styles.cardRow}>
                <View style={[styles.iconWrap, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="person-add" size={24} color={Colors.primary} />
                </View>
                <View style={styles.cardTextWrap}>
                  <Text style={[styles.reportTitle, { color: Colors.primary }]}>Manuel Öğrenci Ekle</Text>
                  <Text style={styles.reportDesc}>
                    Numara, ad soyad ve şube seçerek tek tek öğrenci kaydı oluşturun.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
              </View>
            </Card>
          </TouchableOpacity>

          {/* 2. Excel'den Öğrenci Yükle */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleBulkImportStudents}
            disabled={loading}
            style={{ marginTop: 10 }}
          >
            <Card style={[styles.reportCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: 1 }]}>
              <View style={styles.cardRow}>
                <View style={[styles.iconWrap, { backgroundColor: '#DCFCE7' }]}>
                  <Ionicons name="document-text" size={24} color="#16A34A" />
                </View>
                <View style={styles.cardTextWrap}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={[styles.reportTitle, { color: '#15803D' }]}>Excel'den Öğrenci Yükle</Text>
                    <View style={styles.subActionBadgeSuccess}>
                      <Text style={styles.subActionBadgeSuccessText}>Toplu Ekle</Text>
                    </View>
                  </View>
                  <Text style={styles.reportDesc}>
                    e-Okul veya hazır Excel listesindeki öğrencileri topluca şubelere aktarın.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#16A34A" />
              </View>
            </Card>
          </TouchableOpacity>

          {/* 3. Örnek Excel Şablonu İndir */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleDownloadTemplate}
            disabled={loading}
            style={{ marginTop: 10 }}
          >
            <Card style={[styles.reportCard, styles.templateCard]}>
              <View style={styles.cardRow}>
                <View style={[styles.iconWrap, { backgroundColor: '#EDE9FE' }]}>
                  <Ionicons name="download-outline" size={24} color="#7C3AED" />
                </View>
                <View style={styles.cardTextWrap}>
                  <Text style={styles.reportTitle}>Örnek Excel Şablonu İndir</Text>
                  <Text style={styles.reportDesc}>
                    Öğrenci yüklemesi için sınıf düzeyi ve şube sütunları hazırlanmış örnek şablonu indirin.
                  </Text>
                </View>
                <Ionicons name="share-social-outline" size={22} color="#7C3AED" />
              </View>
            </Card>
          </TouchableOpacity>

          {/* 4. PDF'ten Fotoğraf Aktar */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleStartPdfPhoto}
            disabled={loading || pdfExtracting}
            style={{ marginTop: 10 }}
          >
            <Card style={[styles.reportCard, { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1 }]}>
              <View style={styles.cardRow}>
                <View style={[styles.iconWrap, { backgroundColor: '#FEE2E2' }]}>
                  {pdfExtracting ? (
                    <ActivityIndicator size="small" color="#DC2626" />
                  ) : (
                    <Ionicons name="camera" size={24} color="#DC2626" />
                  )}
                </View>
                <View style={styles.cardTextWrap}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={[styles.reportTitle, { color: '#B91C1C' }]}>PDF'ten Fotoğraf Aktar</Text>
                    <View style={styles.subActionBadgeRed}>
                      <Text style={styles.subActionBadgeRedText}>Akıllı OCR</Text>
                    </View>
                  </View>
                  <Text style={styles.reportDesc}>
                    e-Okul fotoğraflı sınıf listesi PDF'inden resimleri otomatik kesip öğrencilere ata.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#DC2626" />
              </View>
            </Card>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* FILTER & EXPORT MODAL */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconWrap, { backgroundColor: meta.bgColor }]}>
                <Ionicons name={meta.icon} size={24} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{meta.title}</Text>
                <Text style={styles.modalDesc}>{meta.desc}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setFilterModalVisible(false)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* ADIM 1: SINIF DÜZEYİ */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>1. Sınıf Düzeyi</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.chip, selectedGradeLevel === 'all' && styles.chipActive]}
                    onPress={() => {
                      setSelectedGradeLevel('all');
                      setSelectedClassId('all');
                      setSelectedStudentIds([]);
                    }}
                  >
                    <Text style={[styles.chipText, selectedGradeLevel === 'all' && styles.chipTextActive]}>
                      Tüm Düzeyler
                    </Text>
                  </TouchableOpacity>

                  {gradeLevels.map((lvl) => (
                    <TouchableOpacity
                      key={lvl}
                      style={[styles.chip, selectedGradeLevel === lvl && styles.chipActive]}
                      onPress={() => {
                        setSelectedGradeLevel(lvl);
                        setSelectedClassId('all');
                        setSelectedStudentIds([]);
                      }}
                    >
                      <Text style={[styles.chipText, selectedGradeLevel === lvl && styles.chipTextActive]}>
                        {lvl}. Sınıf
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* ADIM 2: ŞUBE SEÇİMİ */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>2. Şube / Sınıf</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.chip, selectedClassId === 'all' && styles.chipActive]}
                    onPress={() => {
                      setSelectedClassId('all');
                      setSelectedStudentIds([]);
                    }}
                  >
                    <Text style={[styles.chipText, selectedClassId === 'all' && styles.chipTextActive]}>
                      {selectedGradeLevel === 'all' ? 'Tüm Şubeler' : `Tüm ${selectedGradeLevel}. Sınıflar`}
                    </Text>
                  </TouchableOpacity>

                  {displayedClasses.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.chip, selectedClassId === c.id && styles.chipActive]}
                      onPress={() => {
                        setSelectedClassId(c.id);
                        setSelectedStudentIds([]);
                      }}
                    >
                      <Text style={[styles.chipText, selectedClassId === c.id && styles.chipTextActive]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* DÖNEM SEÇİMİ (Yalnızca Not Çizelgesi için) */}
              {activeReportType === 'gradebook' && (
                <View style={styles.filterSection}>
                  <Text style={styles.filterLabel}>3. Dönem Seçimi</Text>
                  <View style={styles.termToggleRow}>
                    <TouchableOpacity
                      style={[styles.termBtn, selectedTerm === 1 && styles.termBtnActive]}
                      onPress={() => setSelectedTerm(1)}
                    >
                      <Ionicons
                        name="book-outline"
                        size={18}
                        color={selectedTerm === 1 ? '#FFF' : Colors.textSecondary}
                      />
                      <Text style={[styles.termBtnText, selectedTerm === 1 && styles.termBtnTextActive]}>
                        1. Dönem Notları
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.termBtn, selectedTerm === 2 && styles.termBtnActive]}
                      onPress={() => setSelectedTerm(2)}
                    >
                      <Ionicons
                        name="book-outline"
                        size={18}
                        color={selectedTerm === 2 ? '#FFF' : Colors.textSecondary}
                      />
                      <Text style={[styles.termBtnText, selectedTerm === 2 && styles.termBtnTextActive]}>
                        2. Dönem Notları
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ADIM 3: ÖĞRENCİ SEÇİMİ (Ödev hariç tümünde geçerli) */}
              {activeReportType !== 'assignments' && (
                <View style={styles.filterSection}>
                  <View style={styles.filterHeaderRow}>
                    <Text style={styles.filterLabel}>
                      {activeReportType === 'gradebook' ? '4.' : '3.'} Öğrenci Kapsamı
                    </Text>
                    <Text style={styles.studentCountInfo}>
                      {candidateStudents.length} öğrenci mevcut
                    </Text>
                  </View>

                  {/* Mode switcher: Tüm Öğrenciler vs Öğrenci Seç */}
                  <View style={styles.segmentContainer}>
                    <TouchableOpacity
                      style={[
                        styles.segmentBtn,
                        studentSelectionMode === 'all' && styles.segmentBtnActive,
                      ]}
                      onPress={() => setStudentSelectionMode('all')}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          studentSelectionMode === 'all' && styles.segmentTextActive,
                        ]}
                      >
                        Tüm Öğrenciler ({candidateStudents.length})
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.segmentBtn,
                        studentSelectionMode === 'custom' && styles.segmentBtnActive,
                      ]}
                      onPress={() => setStudentSelectionMode('custom')}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          studentSelectionMode === 'custom' && styles.segmentTextActive,
                        ]}
                      >
                        Öğrencileri Seç ({selectedStudentIds.length})
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Custom Student Selection List */}
                  {studentSelectionMode === 'custom' && (
                    <View style={styles.customStudentBox}>
                      {/* Search Bar */}
                      <View style={styles.searchBar}>
                        <Ionicons name="search" size={18} color={Colors.textSecondary} />
                        <TextInput
                          style={styles.searchInput}
                          placeholder="Öğrenci adı, soyadı veya no ile ara..."
                          placeholderTextColor={Colors.textMuted}
                          value={studentSearchText}
                          onChangeText={setStudentSearchText}
                        />
                        {studentSearchText ? (
                          <TouchableOpacity onPress={() => setStudentSearchText('')}>
                            <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      {/* Quick Select Buttons */}
                      <View style={styles.quickSelectRow}>
                        <TouchableOpacity
                          style={styles.quickBtn}
                          onPress={selectAllCandidates}
                        >
                          <Ionicons name="checkmark-done-circle" size={16} color={Colors.primary} />
                          <Text style={styles.quickBtnText}>Tümünü Seç</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.quickBtn}
                          onPress={clearCandidateSelection}
                        >
                          <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
                          <Text style={[styles.quickBtnText, { color: Colors.danger }]}>
                            Seçimi Temizle
                          </Text>
                        </TouchableOpacity>

                        <Text style={styles.selectedBadgeText}>
                          {selectedStudentIds.length} / {candidateStudents.length} seçili
                        </Text>
                      </View>

                      {/* Student Checkbox List */}
                      <View style={styles.studentListScroll}>
                        {candidateStudents.length === 0 ? (
                          <Text style={styles.noStudentsText}>
                            Seçili filtreye uygun öğrenci bulunamadı.
                          </Text>
                        ) : (
                          candidateStudents.map((st) => {
                            const isSelected = selectedStudentIds.includes(st.id);
                            return (
                              <TouchableOpacity
                                key={st.id}
                                style={[
                                  styles.studentRow,
                                  isSelected && styles.studentRowSelected,
                                ]}
                                onPress={() => toggleStudent(st.id)}
                                activeOpacity={0.7}
                              >
                                <Ionicons
                                  name={isSelected ? 'checkbox' : 'square-outline'}
                                  size={22}
                                  color={isSelected ? Colors.primary : Colors.textSecondary}
                                />
                                <View style={styles.studentNoBadge}>
                                  <Text style={styles.studentNoBadgeText}>
                                    {st.student_number || '-'}
                                  </Text>
                                </View>
                                <Text style={styles.studentRowName} numberOfLines={1}>
                                  {st.first_name} {st.last_name}
                                </Text>
                                {st.class_name && (
                                  <View style={styles.studentClassTag}>
                                    <Text style={styles.studentClassTagText}>
                                      {st.class_name}
                                    </Text>
                                  </View>
                                )}
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </View>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Modal Footer / Action Button */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setFilterModalVisible(false)}
                disabled={generating}
              >
                <Text style={styles.modalCancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, generating && { opacity: 0.7 }]}
                onPress={handleGenerateReport}
                disabled={generating}
              >
                {generating ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="document-text" size={20} color="#FFF" />
                    <Text style={styles.modalSubmitBtnText}>Excel Oluştur & Paylaş</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. MANUEL ÖĞRENCİ EKLEME MODALI */}
      <Modal visible={manualStudentModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.manualModalCard}>
            <View style={styles.manualModalHeader}>
              <Text style={styles.manualModalTitle}>Manuel Öğrenci Ekle</Text>
              <TouchableOpacity onPress={() => setManualStudentModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.manualClassPickerLabel}>Şube Seçiniz *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.manualClassChipRow}>
              {classes.map((cls) => {
                const isSelected = manualClassId === cls.id;
                return (
                  <TouchableOpacity
                    key={cls.id}
                    style={[styles.manualClassChip, isSelected && styles.manualClassChipActive]}
                    onPress={() => setManualClassId(cls.id)}
                  >
                    <Text style={[styles.manualClassChipText, isSelected && styles.manualClassChipTextActive]}>
                      {cls.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Input
              label="Okul / Öğrenci No *"
              placeholder="Örn: 105"
              value={manualStudentNo}
              onChangeText={setManualStudentNo}
              keyboardType="numeric"
            />

            <Input
              label="Öğrenci Adı *"
              placeholder="Örn: Ahmet"
              value={manualFirstName}
              onChangeText={setManualFirstName}
            />

            <Input
              label="Öğrenci Soyadı"
              placeholder="Örn: Yılmaz"
              value={manualLastName}
              onChangeText={setManualLastName}
            />

            <Input
              label="Öğrenci Hakkında Not / Açıklama"
              placeholder="İsteğe bağlı not..."
              value={manualNotes}
              onChangeText={setManualNotes}
            />

            <View style={styles.manualModalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setManualStudentModalVisible(false)}
              />
              <Button
                title="Kaydet"
                style={{ flex: 1 }}
                loading={savingManualStudent}
                onPress={handleSaveManualStudent}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. PDF'TEN FOTOĞRAF AKTARMA MODALI */}
      <Modal
        visible={pdfPhotoModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPdfPhotoModalVisible(false)}
      >
        <View
          style={[
            styles.modalOverlay,
            {
              justifyContent: 'flex-start',
              paddingTop: 0,
              paddingBottom: 0,
            },
          ]}
        >
          <View
            style={[
              styles.pdfModalContent,
              {
                paddingTop: Math.max(16, insets.top + 8),
                paddingBottom: Math.max(16, insets.bottom + 12),
              },
            ]}
          >
            <View style={styles.pdfModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pdfModalTitle}>PDF'ten Fotoğraf Yükle</Text>
                <Text style={styles.pdfModalSubTitle}>
                  {pdfExtractItems.length} vesikalık fotoğraf bulundu •{' '}
                  {pdfExtractItems.filter((i) => i.matchedStudent !== null).length} eşleşti
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPdfPhotoModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.pdfBannerBox}>
              <Ionicons name="information-circle" size={18} color="#0369A1" />
              <Text style={styles.pdfBannerText}>
                Fotoğraflar PDF'teki okul numarası sırasına göre öğrencilerle eşleştirildi. Kontrol edip onaylayınız.
              </Text>
            </View>

            <ScrollView style={styles.pdfMatchScroll} showsVerticalScrollIndicator={true}>
              {pdfExtractItems.map((item, idx) => {
                const matched = item.matchedStudent;
                const pdfDetectedStr = item.detectedNumber
                  ? `PDF No: ${item.detectedNumber}`
                  : item.detectedName
                  ? `PDF Metin: ${item.detectedName}`
                  : 'PDF\'ten numara okunamadı';

                return (
                  <View key={idx} style={styles.pdfMatchRow}>
                    <Image source={{ uri: item.tempUri }} style={styles.pdfMatchThumb} />
                    <View style={styles.pdfMatchInfo}>
                      <View style={styles.pdfMatchBadgeRow}>
                        <Text style={styles.pdfOrderText}>
                          #{idx + 1}. Fotoğraf {item.pageNumber ? `(Sayfa ${item.pageNumber})` : ''}
                        </Text>
                        {matched ? (
                          <View style={styles.matchedBadgeSuccess}>
                            <Ionicons name="checkmark-circle" size={12} color="#047857" />
                            <Text style={styles.matchedBadgeSuccessText}>Eşleşti</Text>
                          </View>
                        ) : (
                          <View style={styles.matchedBadgeWarning}>
                            <Text style={styles.matchedBadgeWarningText}>Eşleşmedi</Text>
                          </View>
                        )}
                      </View>

                      <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary, marginTop: 2 }}>
                        {pdfDetectedStr}
                      </Text>

                      {matched ? (
                        <View style={{ marginTop: 2 }}>
                          <Text style={styles.pdfMatchedStudentName}>
                            Sistem: {matched.first_name} {matched.last_name}
                          </Text>
                          <Text style={{ fontSize: 11, color: Colors.textSecondary, marginTop: 1 }}>
                            Öğrenci No: {matched.student_number || '-'} • Şube: {(matched as any).class_name || '-'}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.pdfUnmatchedText}>
                          Sistemde bu numarayla öğrenci bulunamadı
                        </Text>
                      )}

                      {matched ? (
                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            backgroundColor: '#FEE2E2',
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                            alignSelf: 'flex-start',
                            marginTop: 6,
                          }}
                          onPress={() => handleUpdatePdfMatchStudent(idx, null)}
                        >
                          <Ionicons name="close-circle-outline" size={13} color="#DC2626" />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>
                            Hatalı / Eşleşmeyi Kaldır
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.pdfModalFooterActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setPdfPhotoModalVisible(false)}
              />
              <Button
                title={`Fotoğrafları Kaydet (${pdfExtractItems.filter((i) => i.matchedStudent !== null).length})`}
                icon="checkmark"
                loading={savingPdfPhotos}
                disabled={
                  pdfExtractItems.filter((i) => i.matchedStudent !== null).length === 0 ||
                  savingPdfPhotos
                }
                style={{ flex: 1.5 }}
                onPress={handleConfirmSavePdfPhotos}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primaryDark,
  },
  reportCard: {
    padding: 15,
    marginBottom: 12,
  },
  templateCard: {
    borderColor: '#DDD6FE',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  reportDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  templateSection: {
    marginTop: 18,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },

  // MODAL STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    display: 'flex',
    flexDirection: 'column',
    ...Shadows.large,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  modalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalBody: {
    padding: 16,
  },
  filterSection: {
    marginBottom: 18,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  studentCountInfo: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: '#FFF',
  },
  termToggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  termBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  termBtnActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  termBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  termBtnTextActive: {
    color: '#FFF',
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentBtnActive: {
    backgroundColor: '#FFF',
    ...Shadows.small,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  customStudentBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    padding: 0,
  },
  quickSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quickBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  selectedBadgeText: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  studentListScroll: {
    maxHeight: 220,
  },
  noStudentsText: {
    textAlign: 'center',
    fontSize: 13,
    color: Colors.textSecondary,
    marginVertical: 16,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  studentRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#EFF6FF',
  },
  studentNoBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  studentNoBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  studentRowName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  studentClassTag: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  studentClassTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 12,
    backgroundColor: '#FFF',
  },
  modalCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  modalSubmitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16A34A', // Excel Green
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 50,
    ...Shadows.small,
  },
  modalSubmitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  subActionBadgeSuccess: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  subActionBadgeSuccessText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  subActionBadgeRed: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  subActionBadgeRedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B91C1C',
  },
  // Manual Student Modal Styles
  manualModalCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 420,
    ...Shadows.large,
  },
  manualModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  manualModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  manualClassPickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  manualClassChipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
  },
  manualClassChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  manualClassChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  manualClassChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  manualClassChipTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  manualModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  // PDF Photo Modal Styles
  pdfModalContent: {
    flex: 1,
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
  },
  pdfModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pdfModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  pdfModalSubTitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  pdfBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    padding: 10,
    gap: 8,
    marginTop: 12,
    marginBottom: 10,
  },
  pdfBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '600',
    lineHeight: 16,
  },
  pdfMatchScroll: {
    flex: 1,
    marginBottom: 12,
  },
  pdfMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 12,
  },
  pdfMatchThumb: {
    width: 48,
    height: 60,
    borderRadius: 6,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pdfMatchInfo: {
    flex: 1,
  },
  pdfMatchBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  pdfOrderText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  matchedBadgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  matchedBadgeSuccessText: {
    fontSize: 10,
    color: '#047857',
    fontWeight: '700',
  },
  matchedBadgeWarning: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  matchedBadgeWarningText: {
    fontSize: 10,
    color: '#B45309',
    fontWeight: '700',
  },
  pdfMatchedStudentName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  pdfUnmatchedText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  pdfModalFooterActions: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: '#FFF',
  },
});
