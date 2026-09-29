import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '../theme/colors';
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
  getNotesByStudent,
  createNote,
  deleteNote,
  getQuickNotes,
  QuickNoteItem,
} from '../database/operations/noteOperations';
import {
  getCurrentActiveLessonSummary,
  CurrentLessonSummary,
} from '../database/operations/scheduleOperations';
import {
  pickAndParseStudentsExcel,
  generateStudentTemplateExcel,
  exportClassStudentsToExcel,
  generateGradebookTemplateExcel,
  exportClassGradebookToExcel,
  pickAndParseGradebookExcel,
} from '../utils/excelService';
import {
  getFullClassGradebook,
  saveStudentGrades,
  createQuiz,
  deleteQuiz,
  saveQuizScore,
} from '../database/operations/gradeOperations';
import {
  pickSinglePhotoFromSource,
  savePhotoPermanently,
  pickBulkPhotosFromDevice,
  matchPhotosWithStudents,
  MAX_PHOTO_SIZE_BYTES,
  MAX_PHOTO_SIZE_LABEL,
  BulkPhotoMatchResult,
} from '../utils/photoService';
import {
  extractPhotosFromPdf,
  PdfExtractedStudentPhoto,
} from '../utils/pdfPhotoExtractor';
import { Student, ClassItem, StudentNote, StudentGradeRow, QuizItem } from '../types';

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

  // Bulk Photo Files Modal state
  const [bulkPhotoModalVisible, setBulkPhotoModalVisible] = useState(false);
  const [bulkPhotoResult, setBulkPhotoResult] = useState<BulkPhotoMatchResult | null>(null);
  const [bulkPhotoSaving, setBulkPhotoSaving] = useState(false);

  // PDF Photo Extract Modal state
  const [pdfPhotoModalVisible, setPdfPhotoModalVisible] = useState(false);
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [pdfExtractItems, setPdfExtractItems] = useState<PdfExtractedStudentPhoto[]>([]);
  const [savingPdfPhotos, setSavingPdfPhotos] = useState(false);

  // Student Detail & Opinion Modal state
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [studentNotesList, setStudentNotesList] = useState<StudentNote[]>([]);
  const [quickNotesList, setQuickNotesList] = useState<QuickNoteItem[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [activeLesson, setActiveLesson] = useState<CurrentLessonSummary | null>(null);

  // Multi-select / Bulk operations state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);

  // Bulk Transfer Modal state
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [availableClasses, setAvailableClasses] = useState<ClassItem[]>([]);
  const [selectedTargetClassId, setSelectedTargetClassId] = useState<number | null>(null);

  // Top Segment Tab: 'students' (Öğrenci Listesi) vs 'gradebook' (Not Çizelgesi)
  const [activeViewTab, setActiveViewTab] = useState<'students' | 'gradebook'>('students');

  // Gradebook State
  const [activeTerm, setActiveTerm] = useState<1 | 2>(1);
  const [gradebookData, setGradebookData] = useState<{
    students: StudentGradeRow[];
    quizzes: QuizItem[];
  }>({ students: [], quizzes: [] });
  const [loadingGradebook, setLoadingGradebook] = useState(false);
  const [gradeSearchQuery, setGradeSearchQuery] = useState('');

  // Add Quiz Modal State
  const [quizModalVisible, setQuizModalVisible] = useState(false);
  const [quizTitleInput, setQuizTitleInput] = useState('');
  const [savingQuiz, setSavingQuiz] = useState(false);

  // Single Student Grade Edit Modal State
  const [editGradeModalVisible, setEditGradeModalVisible] = useState(false);
  const [editingGradeRow, setEditingGradeRow] = useState<StudentGradeRow | null>(null);
  const [gradeInputs, setGradeInputs] = useState<{
    exam1: string;
    exam2: string;
    exam3: string;
    perf1: string;
    perf2: string;
    perf3: string;
    quizScores: Record<number, string>;
  }>({
    exam1: '',
    exam2: '',
    exam3: '',
    perf1: '',
    perf2: '',
    perf3: '',
    quizScores: {},
  });
  const [savingSingleGrade, setSavingSingleGrade] = useState(false);

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

  const loadGradebook = async (termToLoad?: 1 | 2) => {
    const term = termToLoad || activeTerm;
    try {
      setLoadingGradebook(true);
      const data = await getFullClassGradebook(classId, term);
      setGradebookData(data);
    } catch (e) {
      console.error('Error loading gradebook:', e);
    } finally {
      setLoadingGradebook(false);
    }
  };

  const handleChangeTerm = (term: 1 | 2) => {
    setActiveTerm(term);
    loadGradebook(term);
  };

  const handleOpenAddQuiz = () => {
    const nextQuizNum = gradebookData.quizzes.length + 1;
    setQuizTitleInput(`Quiz ${nextQuizNum}`);
    setQuizModalVisible(true);
  };

  const handleSaveNewQuiz = async () => {
    if (!quizTitleInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen quiz başlığı giriniz.');
      return;
    }
    setSavingQuiz(true);
    try {
      await createQuiz(classId, activeTerm, quizTitleInput.trim());
      setQuizModalVisible(false);
      setQuizTitleInput('');
      await loadGradebook();
      Alert.alert('Başarılı', `"${quizTitleInput.trim()}" quizi başarıyla eklendi.`);
    } catch (e) {
      Alert.alert('Hata', 'Quiz eklenemedi.');
    } finally {
      setSavingQuiz(false);
    }
  };

  const handleDeleteQuizConfirm = (quiz: QuizItem) => {
    Alert.alert(
      'Quiz Sil',
      `"${quiz.title}" quizini ve öğrencilerin bu quizdeki notlarını silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteQuiz(quiz.id);
              await loadGradebook();
            } catch (e) {
              Alert.alert('Hata', 'Quiz silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleOpenEditGrade = (row: StudentGradeRow) => {
    setEditingGradeRow(row);
    const qs: Record<number, string> = {};
    for (const q of gradebookData.quizzes) {
      const val = row.quizScores[q.id];
      qs[q.id] = val !== null && val !== undefined ? String(val) : '';
    }
    setGradeInputs({
      exam1: row.exam1 !== null && row.exam1 !== undefined ? String(row.exam1) : '',
      exam2: row.exam2 !== null && row.exam2 !== undefined ? String(row.exam2) : '',
      exam3: row.exam3 !== null && row.exam3 !== undefined ? String(row.exam3) : '',
      perf1: row.perf1 !== null && row.perf1 !== undefined ? String(row.perf1) : '',
      perf2: row.perf2 !== null && row.perf2 !== undefined ? String(row.perf2) : '',
      perf3: row.perf3 !== null && row.perf3 !== undefined ? String(row.perf3) : '',
      quizScores: qs,
    });
    setEditGradeModalVisible(true);
  };

  const handleSaveSingleGrade = async () => {
    if (!editingGradeRow) return;

    const parseVal = (str: string): number | null => {
      const trimmed = str.trim().replace(',', '.');
      if (!trimmed) return null;
      const num = parseFloat(trimmed);
      if (isNaN(num)) return null;
      return Math.min(100, Math.max(0, Math.round(num * 10) / 10));
    };

    setSavingSingleGrade(true);
    try {
      await saveStudentGrades(editingGradeRow.student_id, classId, activeTerm, {
        exam1: parseVal(gradeInputs.exam1),
        exam2: parseVal(gradeInputs.exam2),
        exam3: parseVal(gradeInputs.exam3),
        perf1: parseVal(gradeInputs.perf1),
        perf2: parseVal(gradeInputs.perf2),
        perf3: parseVal(gradeInputs.perf3),
      });

      for (const q of gradebookData.quizzes) {
        const valStr = gradeInputs.quizScores[q.id];
        const valNum = valStr !== undefined ? parseVal(valStr) : null;
        await saveQuizScore(q.id, editingGradeRow.student_id, valNum);
      }

      setEditGradeModalVisible(false);
      await loadGradebook();
    } catch (e) {
      Alert.alert('Hata', 'Notlar kaydedilemedi.');
    } finally {
      setSavingSingleGrade(false);
    }
  };

  const handleDownloadGradebookTemplate = async () => {
    try {
      await generateGradebookTemplateExcel(
        className,
        activeTerm,
        students,
        gradebookData.quizzes
      );
    } catch (e) {
      Alert.alert('Hata', 'Not şablonu oluşturulamadı.');
    }
  };

  const handleExportGradebookExcel = async () => {
    try {
      await exportClassGradebookToExcel(className, activeTerm, gradebookData);
    } catch (e) {
      Alert.alert('Hata', 'Not çizelgesi Excel çıktısı oluşturulamadı.');
    }
  };

  const handleImportGradebookExcel = async () => {
    try {
      const res = await pickAndParseGradebookExcel(
        classId,
        activeTerm,
        students,
        gradebookData.quizzes
      );

      if (!res.success) {
        if (res.error && res.error !== 'Dosya seçilmedi.') {
          Alert.alert('Hata', res.error);
        }
        return;
      }

      await loadGradebook();
      let msg = `${res.updatedCount} öğrencinin ${activeTerm}. Dönem notları başarıyla güncellendi!`;
      if (res.newQuizzesCreated.length > 0) {
        msg += `\n\nOluşturulan yeni quizler: ${res.newQuizzesCreated.join(', ')}`;
      }
      Alert.alert('Başarılı 🎉', msg);
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Excel not yüklemesi başarısız.');
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadStudents();
      loadGradebook();
    }, [classId, activeTerm])
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
      if (detailStudent && detailStudent.id === photoTargetStudent.id) {
        setDetailStudent({ ...detailStudent, photo_uri: permanentUri });
      }
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
      if (detailStudent && detailStudent.id === photoTargetStudent.id) {
        setDetailStudent({ ...detailStudent, photo_uri: undefined });
      }
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

  // --- PDF PHOTO EXTRACTION & MATCHING ---
  const handleStartPdfPhoto = async () => {
    if (students.length === 0) {
      Alert.alert('Bilgi', 'Önce bu şubeye öğrenci eklemelisiniz.');
      return;
    }
    try {
      setPdfExtracting(true);
      const res = await extractPhotosFromPdf(students);
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
      loadStudents();
      Alert.alert(
        'Başarılı 🎉',
        `PDF'ten toplam ${savedCount} öğrenci fotoğrafı başarıyla yüklendi ve öğrencilere atandı!`
      );
    } catch (e: any) {
      Alert.alert('Hata', 'Fotoğraflar kaydedilirken bir hata oluştu.');
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

  // --- STUDENT DETAIL & OBSERVATION MODAL ---
  const handleOpenStudentDetail = async (student: Student) => {
    setDetailStudent(student);
    setDetailModalVisible(true);
    setNewNoteText('');
    setLoadingNotes(true);
    try {
      const [notes, quicks, currentSched] = await Promise.all([
        getNotesByStudent(student.id),
        getQuickNotes(),
        getCurrentActiveLessonSummary(),
      ]);
      setStudentNotesList(notes);
      setQuickNotesList(quicks);
      setActiveLesson(currentSched);
    } catch (e) {
      console.error('Error loading student detail:', e);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleAddNoteFromDetail = async (textToAdd?: string) => {
    const text = (textToAdd || newNoteText).trim();
    if (!text || !detailStudent) return;
    setSavingNote(true);
    try {
      await createNote(detailStudent.id, classId, text, undefined, activeLesson?.fullText);
      setNewNoteText('');
      const updatedNotes = await getNotesByStudent(detailStudent.id);
      setStudentNotesList(updatedNotes);
    } catch (e) {
      Alert.alert('Hata', 'Görüş kaydedilemedi.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNoteFromDetail = async (noteId: number) => {
    if (!detailStudent) return;
    try {
      await deleteNote(noteId);
      const updatedNotes = await getNotesByStudent(detailStudent.id);
      setStudentNotesList(updatedNotes);
    } catch (e) {
      Alert.alert('Hata', 'Görüş silinemedi.');
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

  const formatScore = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return '-';
    return String(val);
  };

  const getScoreStyle = (val: number | null | undefined) => {
    if (val === null || val === undefined || isNaN(val)) return styles.textEmptyScore;
    if (val < 50) return styles.textFailScore;
    if (val >= 85) return styles.textHighScore;
    return styles.textNormalScore;
  };

  return (
    <View style={styles.container}>
      <Header
        title={className}
        subtitle={`${students.length} Kayıtlı Öğrenci`}
        showBack
        onBack={() => navigation.goBack()}
      />

      {/* View Segment Switch: Öğrenciler / Not Çizelgesi & Quizler */}
      <View style={styles.segmentSwitchWrap}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeViewTab === 'students' && styles.segmentBtnActive]}
          onPress={() => setActiveViewTab('students')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="people"
            size={17}
            color={activeViewTab === 'students' ? '#FFFFFF' : Colors.textSecondary}
          />
          <Text
            style={[styles.segmentBtnText, activeViewTab === 'students' && styles.segmentBtnTextActive]}
          >
            Öğrenciler ({students.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeViewTab === 'gradebook' && styles.segmentBtnActive]}
          onPress={() => {
            setActiveViewTab('gradebook');
            loadGradebook();
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="calculator"
            size={17}
            color={activeViewTab === 'gradebook' ? '#FFFFFF' : Colors.textSecondary}
          />
          <Text
            style={[styles.segmentBtnText, activeViewTab === 'gradebook' && styles.segmentBtnTextActive]}
          >
            Not Çizelgesi & Quizler
          </Text>
        </TouchableOpacity>
      </View>

      {activeViewTab === 'students' && (
        <>
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
              seçili
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
              <Text style={styles.transferBtnText}>Şube Taşı</Text>
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

            <TouchableOpacity
              style={[styles.selectionActionBtn, styles.closeSelectionBtn]}
              onPress={toggleSelectionMode}
            >
              <Ionicons name="close" size={14} color={Colors.textSecondary} />
              <Text style={styles.closeSelectionBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Search Bar & Counter */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchRow}>
          <View style={{ flex: 1 }}>
            <Input
              placeholder="Öğrenci adı, soyadı veya no ile ara..."
              icon="search"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onClear={() => setSearchQuery('')}
              style={{ height: 40 }}
            />
          </View>
          <View style={styles.studentCountBadge}>
            <Text style={styles.studentCountBadgeText}>
              {filteredStudents.length} / {students.length}
            </Text>
          </View>
        </View>
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

                  {/* Student Avatar / Photo - Large Portrait */}
                  <TouchableOpacity
                    style={styles.avatarWrap}
                    onPress={() => handleOpenStudentDetail(item)}
                    activeOpacity={0.8}
                  >
                    {item.photo_uri ? (
                      <Image source={{ uri: item.photo_uri }} style={styles.avatarImg} />
                    ) : (
                      <View style={styles.numberBadge}>
                        <Ionicons name="person" size={22} color={Colors.textMuted} />
                        <Text style={styles.numberText}>{item.student_number || '-'}</Text>
                      </View>
                    )}
                    <View style={styles.zoomIconBadge}>
                      <Ionicons name="expand" size={10} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.studentInfo}
                    onPress={() => handleOpenStudentDetail(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.studentName}>
                      {item.first_name} {item.last_name}
                    </Text>
                    <Text style={styles.studentSubInfo}>
                      No: {item.student_number || '-'}
                      {item.notes ? ` • ${item.notes}` : ''}
                    </Text>
                  </TouchableOpacity>

                  {!selectionMode && (
                    <View style={styles.studentActions}>
                      {/* Quick opinion / student detail modal */}
                      <TouchableOpacity
                        style={[styles.smallIconBtn, { backgroundColor: Colors.warningLight }]}
                        onPress={() => handleOpenStudentDetail(item)}
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

      {/* Floating Action Button (FAB) */}
      {!selectionMode && (
        <TouchableOpacity
          style={styles.floatingActionPill}
          onPress={() => setActionMenuVisible(true)}
          activeOpacity={0.85}
        >
          {pdfExtracting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <View style={styles.fabIconCircle}>
                <Ionicons name="sparkles" size={17} color="#FFF" />
              </View>
              <Text style={styles.fabPillText}>İşlemler</Text>
            </>
          )}
        </TouchableOpacity>
      )}
        </>
      )}

      {/* Gradebook View */}
      {activeViewTab === 'gradebook' && (
        <View style={styles.gradebookContainer}>
          {/* Term Switcher & Gradebook Actions */}
          <View style={styles.gradebookControlBar}>
            {/* Term selector (1. Dönem / 2. Dönem) */}
            <View style={styles.termSelector}>
              <TouchableOpacity
                style={[styles.termBtn, activeTerm === 1 && styles.termBtnActive]}
                onPress={() => handleChangeTerm(1)}
              >
                <Text style={[styles.termBtnText, activeTerm === 1 && styles.termBtnTextActive]}>
                  1. Dönem
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.termBtn, activeTerm === 2 && styles.termBtnActive]}
                onPress={() => handleChangeTerm(2)}
              >
                <Text style={[styles.termBtnText, activeTerm === 2 && styles.termBtnTextActive]}>
                  2. Dönem
                </Text>
              </TouchableOpacity>
            </View>

            {/* Action Buttons */}
            <View style={styles.gradeActionsRow}>
              <TouchableOpacity
                style={styles.gradeActionBtnPrimary}
                onPress={handleOpenAddQuiz}
              >
                <Ionicons name="add-circle-outline" size={15} color="#FFFFFF" />
                <Text style={styles.gradeActionBtnPrimaryText}>+ Quiz</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gradeActionBtnSecondary}
                onPress={handleImportGradebookExcel}
              >
                <Ionicons name="cloud-upload-outline" size={15} color={Colors.primary} />
                <Text style={styles.gradeActionBtnSecondaryText}>Excel Yükle</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gradeActionBtnOutline}
                onPress={handleDownloadGradebookTemplate}
              >
                <Ionicons name="download-outline" size={15} color={Colors.textSecondary} />
                <Text style={styles.gradeActionBtnOutlineText}>Şablon</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gradeActionBtnOutline}
                onPress={() => navigation.navigate('ReportsTab')}
              >
                <Ionicons name="stats-chart-outline" size={15} color={Colors.textSecondary} />
                <Text style={styles.gradeActionBtnOutlineText}>Raporlar</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Search bar for gradebook */}
          <View style={styles.gradeSearchWrap}>
            <View style={styles.gradeSearchInput}>
              <Ionicons name="search" size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.gradeSearchTextInput}
                placeholder="Öğrenci adı veya no ile filtrele..."
                placeholderTextColor={Colors.textMuted}
                value={gradeSearchQuery}
                onChangeText={setGradeSearchQuery}
              />
              {gradeSearchQuery ? (
                <TouchableOpacity onPress={() => setGradeSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Gradebook Info & Hint */}
          <View style={styles.gradebookSummaryBar}>
            <Text style={styles.gradebookSummaryText}>
              <Text style={{ fontWeight: '700' }}>{gradebookData.students.length} Öğrenci</Text> •{' '}
              {gradebookData.quizzes.length} Quiz tanımlı
            </Text>
            <Text style={styles.gradebookHintText}>💡 Not düzenlemek için öğrenci satırına dokunun</Text>
          </View>

          {/* Gradebook Table */}
          {loadingGradebook ? (
            <View style={styles.gradebookLoadingWrap}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.gradebookLoadingText}>Notlar yükleniyor...</Text>
            </View>
          ) : gradebookData.students.length === 0 ? (
            <View style={styles.gradebookEmptyWrap}>
              <Ionicons name="school-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.gradebookEmptyTitle}>Bu sınıfta henüz kayıtlı öğrenci yok</Text>
              <Text style={styles.gradebookEmptySub}>
                "Öğrenciler" sekmesinden öğrenci ekleyebilir veya Excel ile yükleyebilirsiniz.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScrollX}>
              <View>
                {/* Table Header Row */}
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.thCell, styles.colNo]}>No</Text>
                  <Text style={[styles.thCell, styles.colName]}>Öğrenci</Text>

                  {/* 3 Yazılı */}
                  <Text style={[styles.thCell, styles.colExam]}>1.Yaz</Text>
                  <Text style={[styles.thCell, styles.colExam]}>2.Yaz</Text>
                  <Text style={[styles.thCell, styles.colExam]}>3.Yaz</Text>
                  <Text style={[styles.thCell, styles.colAvg, styles.bgExamAvg]}>Y.Ort</Text>

                  {/* 3 Performans */}
                  <Text style={[styles.thCell, styles.colPerf]}>1.Perf</Text>
                  <Text style={[styles.thCell, styles.colPerf]}>2.Perf</Text>
                  <Text style={[styles.thCell, styles.colPerf]}>3.Perf</Text>
                  <Text style={[styles.thCell, styles.colAvg, styles.bgPerfAvg]}>P.Ort</Text>

                  {/* Dinamik Quiz Sütunları */}
                  {gradebookData.quizzes.map((q) => (
                    <TouchableOpacity
                      key={q.id}
                      style={[styles.thCellClickable, styles.colQuiz]}
                      onLongPress={() => handleDeleteQuizConfirm(q)}
                      onPress={() =>
                        Alert.alert(
                          q.title,
                          'Bu quizi silmek ister misiniz?',
                          [
                            { text: 'Vazgeç', style: 'cancel' },
                            {
                              text: 'Quizi Sil',
                              style: 'destructive',
                              onPress: () => handleDeleteQuizConfirm(q),
                            },
                          ]
                        )
                      }
                    >
                      <Text style={styles.thQuizTitle} numberOfLines={1}>
                        {q.title}
                      </Text>
                      <Ionicons name="close-circle-outline" size={12} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))}

                  {/* Quiz Ort. */}
                  {gradebookData.quizzes.length > 0 && (
                    <Text style={[styles.thCell, styles.colAvg, styles.bgQuizAvg]}>Q.Ort</Text>
                  )}

                  {/* Genel Ortalama */}
                  <Text style={[styles.thCell, styles.colOverall]}>Ders Ort.</Text>
                </View>

                {/* Table Body */}
                <ScrollView style={styles.tableScrollY} showsVerticalScrollIndicator={true}>
                  {gradebookData.students
                    .filter((r) => {
                      if (!gradeSearchQuery.trim()) return true;
                      const term = gradeSearchQuery.toLowerCase();
                      const fullName = `${r.first_name} ${r.last_name}`.toLowerCase();
                      const no = (r.student_number || '').toLowerCase();
                      return fullName.includes(term) || no.includes(term);
                    })
                    .map((row, index) => {
                      const isEven = index % 2 === 0;
                      return (
                        <TouchableOpacity
                          key={row.student_id}
                          style={[styles.tableDataRow, isEven && styles.tableDataRowEven]}
                          onPress={() => handleOpenEditGrade(row)}
                          activeOpacity={0.7}
                        >
                          {/* Student No */}
                          <Text style={[styles.tdCell, styles.colNo, styles.textBold]}>
                            {row.student_number || '-'}
                          </Text>

                          {/* Student Name */}
                          <View style={[styles.tdCell, styles.colName, styles.tdNameWrap]}>
                            <Text style={styles.tdStudentName} numberOfLines={1}>
                              {row.first_name} {row.last_name}
                            </Text>
                          </View>

                          {/* 1.Y, 2.Y, 3.Y */}
                          <Text style={[styles.tdCell, styles.colExam, getScoreStyle(row.exam1)]}>
                            {formatScore(row.exam1)}
                          </Text>
                          <Text style={[styles.tdCell, styles.colExam, getScoreStyle(row.exam2)]}>
                            {formatScore(row.exam2)}
                          </Text>
                          <Text style={[styles.tdCell, styles.colExam, getScoreStyle(row.exam3)]}>
                            {formatScore(row.exam3)}
                          </Text>
                          <Text style={[styles.tdCell, styles.colAvg, styles.bgExamAvg, styles.textBold]}>
                            {formatScore(row.examAvg)}
                          </Text>

                          {/* 1.P, 2.P, 3.P */}
                          <Text style={[styles.tdCell, styles.colPerf, getScoreStyle(row.perf1)]}>
                            {formatScore(row.perf1)}
                          </Text>
                          <Text style={[styles.tdCell, styles.colPerf, getScoreStyle(row.perf2)]}>
                            {formatScore(row.perf2)}
                          </Text>
                          <Text style={[styles.tdCell, styles.colPerf, getScoreStyle(row.perf3)]}>
                            {formatScore(row.perf3)}
                          </Text>
                          <Text style={[styles.tdCell, styles.colAvg, styles.bgPerfAvg, styles.textBold]}>
                            {formatScore(row.perfAvg)}
                          </Text>

                          {/* Dynamic Quizzes */}
                          {gradebookData.quizzes.map((q) => {
                            const qScore = row.quizScores[q.id];
                            return (
                              <Text
                                key={q.id}
                                style={[styles.tdCell, styles.colQuiz, getScoreStyle(qScore)]}
                              >
                                {formatScore(qScore)}
                              </Text>
                            );
                          })}

                          {/* Quiz Avg */}
                          {gradebookData.quizzes.length > 0 && (
                            <Text style={[styles.tdCell, styles.colAvg, styles.bgQuizAvg, styles.textBold]}>
                              {formatScore(row.quizAvg)}
                            </Text>
                          )}

                          {/* Overall Avg */}
                          <View style={[styles.tdCell, styles.colOverall]}>
                            <View
                              style={[
                                styles.overallBadge,
                                row.overallAvg !== null && row.overallAvg !== undefined
                                  ? row.overallAvg >= 50
                                    ? styles.badgePass
                                    : styles.badgeFail
                                  : null,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.overallText,
                                  row.overallAvg !== null && row.overallAvg !== undefined
                                    ? row.overallAvg >= 50
                                      ? styles.textPass
                                      : styles.textFail
                                    : null,
                                ]}
                              >
                                {formatScore(row.overallAvg)}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                </ScrollView>
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* Floating Action Menu Modal */}
      <Modal
        visible={actionMenuVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActionMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.actionModalOverlay}
          activeOpacity={1}
          onPress={() => setActionMenuVisible(false)}
        >
          <View style={styles.actionModalSheet} onStartShouldSetResponder={() => true}>
            {/* Sheet Handle */}
            <View style={styles.sheetHandle} />

            {/* Sheet Header */}
            <View style={styles.actionSheetHeader}>
              <View>
                <Text style={styles.actionSheetTitle}>Şube & Öğrenci İşlemleri</Text>
                <Text style={styles.actionSheetSub}>
                  {className} • {students.length} Kayıtlı Öğrenci
                </Text>
              </View>
              <TouchableOpacity
                style={styles.actionSheetCloseBtn}
                onPress={() => setActionMenuVisible(false)}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Action Items */}
            <View style={styles.actionSheetContent}>
              {/* 1. Manuel Öğrenci Ekle */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  setTimeout(() => handleOpenAdd(), 200);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="person-add" size={22} color={Colors.primary} />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <Text style={styles.actionSheetItemTitle}>Manuel Öğrenci Ekle</Text>
                  <Text style={styles.actionSheetItemDesc}>
                    Numara, ad soyad ve fotoğraf ile tek tek öğrenci kaydı oluşturun.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* 2. Excel'den Yükle */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  setTimeout(() => handleExcelImport(), 200);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#DCFCE7' }]}>
                  <Ionicons name="document-text" size={22} color="#16A34A" />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.actionSheetItemTitle}>Excel'den Öğrenci Yükle</Text>
                    <View style={[styles.actionItemBadge, { backgroundColor: '#DCFCE7' }]}>
                      <Text style={[styles.actionItemBadgeText, { color: '#15803D' }]}>Toplu Ekle</Text>
                    </View>
                  </View>
                  <Text style={styles.actionSheetItemDesc}>
                    e-Okul veya hazır Excel listesindeki öğrencileri topluca şubeye aktarın.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* 3. Örnek Excel Şablonu İndir */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  handleDownloadTemplate();
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#EDE9FE' }]}>
                  <Ionicons name="download-outline" size={22} color="#7C3AED" />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <Text style={styles.actionSheetItemTitle}>Örnek Excel Şablonu İndir</Text>
                  <Text style={styles.actionSheetItemDesc}>
                    Öğrenci yüklemesi için sütunları hazırlanmış örnek şablon dosyasını paylaşın.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* 4. PDF'ten Fotoğraf Aktar */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  setTimeout(() => handleStartPdfPhoto(), 200);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="camera" size={22} color="#DC2626" />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.actionSheetItemTitle}>PDF'ten Fotoğraf Aktar</Text>
                    <View style={[styles.actionItemBadge, { backgroundColor: '#FEE2E2' }]}>
                      <Text style={[styles.actionItemBadgeText, { color: '#B91C1C' }]}>Akıllı OCR</Text>
                    </View>
                  </View>
                  <Text style={styles.actionSheetItemDesc}>
                    e-Okul fotoğraflı sınıf listesi PDF'inden resimleri otomatik kesip öğrencilere ata.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* 5. Dosyalardan Fotoğraf Eşle */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  setTimeout(() => handleStartBulkPhoto(), 200);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#CCFBF1' }]}>
                  <Ionicons name="images" size={22} color="#0D9488" />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <Text style={styles.actionSheetItemTitle}>Dosyalardan Fotoğraf Eşle</Text>
                  <Text style={styles.actionSheetItemDesc}>
                    Galeriden veya klasörden numara/isim ile fotoğrafları otomatik eşleştirin.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* 6. Çoklu Seçim Modu */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setActionMenuVisible(false);
                  toggleSelectionMode();
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrap, { backgroundColor: '#FFEDD5' }]}>
                  <Ionicons name="checkbox-outline" size={22} color="#EA580C" />
                </View>
                <View style={styles.actionSheetItemTextWrap}>
                  <Text style={styles.actionSheetItemTitle}>Çoklu Seçim Modu</Text>
                  <Text style={styles.actionSheetItemDesc}>
                    Birden fazla öğrenciyi seçerek toplu şube transferi yapın veya silin.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

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

      {/* PDF Photo Import Modal */}
      <Modal
        visible={pdfPhotoModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPdfPhotoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={styles.detailHeaderInfo}>
                <Text style={styles.modalTitle}>PDF'ten Fotoğraf Yükle</Text>
                <Text style={styles.detailModalSubTitle}>
                  {pdfExtractItems.length} vesikalık fotoğraf bulundu •{' '}
                  {pdfExtractItems.filter((i) => i.matchedStudent !== null).length} eşleşti
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPdfPhotoModalVisible(false)}
                style={styles.detailModalCloseBtn}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.pdfBannerBox}>
              <Ionicons name="information-circle" size={18} color="#0369A1" />
              <Text style={styles.pdfBannerText}>
                Fotoğraflar PDF'teki okul numarası sırasına göre şube listenizle eşleştirildi. Kontrol edip onaylayınız.
              </Text>
            </View>

            <ScrollView style={styles.pdfMatchScroll} showsVerticalScrollIndicator={true}>
              {pdfExtractItems.map((item, idx) => {
                const matched = item.matchedStudent;
                return (
                  <View key={idx} style={styles.pdfMatchRow}>
                    <Image source={{ uri: item.tempUri }} style={styles.pdfMatchThumb} />
                    <View style={styles.pdfMatchInfo}>
                      <View style={styles.pdfMatchBadgeRow}>
                        <Text style={styles.pdfOrderText}>#{idx + 1}. Fotoğraf</Text>
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

                      {matched ? (
                        <Text style={styles.pdfMatchedStudentName}>
                          {matched.student_number} - {matched.first_name} {matched.last_name}
                        </Text>
                      ) : (
                        <Text style={styles.pdfUnmatchedText}>
                          Sıradaki öğrenci bulunamadı
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setPdfPhotoModalVisible(false)}
              />
              <Button
                title={`Kaydet (${pdfExtractItems.filter((i) => i.matchedStudent !== null).length})`}
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

      {/* Student Detail & Opinion Modal */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.detailModalOverlay}>
          <View style={styles.detailModalContainer}>
            {/* Header */}
            <View style={styles.detailModalHeader}>
              <View style={styles.detailHeaderInfo}>
                <Text style={styles.detailModalTitle} numberOfLines={1}>
                  {detailStudent?.first_name} {detailStudent?.last_name}
                </Text>
                <Text style={styles.detailModalSubTitle}>
                  {className} • No: {detailStudent?.student_number || '-'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.detailModalCloseBtn}
                onPress={() => setDetailModalVisible(false)}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.detailModalBody}
              contentContainerStyle={{ paddingBottom: 28 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Photo & Basic Info Banner */}
              <View style={styles.detailStudentCard}>
                {/* Large Centered Photo Wrap */}
                <View style={styles.detailPhotoWrap}>
                  <TouchableOpacity
                    onPress={() => {
                      if (detailStudent) handleOpenPhotoOptions(detailStudent);
                    }}
                    activeOpacity={0.85}
                    style={styles.detailPhotoTouchWrap}
                  >
                    {detailStudent?.photo_uri ? (
                      <Image
                        source={{ uri: detailStudent.photo_uri }}
                        style={styles.detailPhotoLarge}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.detailPhotoPlaceholder}>
                        <Ionicons name="person" size={80} color={Colors.textMuted} />
                        <Text style={styles.detailPlaceholderNo}>
                          #{detailStudent?.student_number || '-'}
                        </Text>
                      </View>
                    )}
                    <View style={styles.detailPhotoActionOverlay}>
                      <Ionicons name="camera" size={14} color="#FFFFFF" />
                      <Text style={styles.detailPhotoActionOverlayText}>Fotoğraf Değiştir</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Info Under Photo */}
                <View style={styles.detailStudentMetaUnder}>
                  {/* Name and Surname */}
                  <Text style={styles.detailStudentFullName}>
                    {detailStudent?.first_name} {detailStudent?.last_name}
                  </Text>

                  {/* Badges for No and Class */}
                  <View style={styles.detailBadgesRow}>
                    <View style={styles.detailNumberBadge}>
                      <Ionicons name="id-card-outline" size={13} color={Colors.primary} />
                      <Text style={styles.detailNumberBadgeText}>
                        No: {detailStudent?.student_number || '-'}
                      </Text>
                    </View>

                    <View style={styles.detailClassBadge}>
                      <Ionicons name="school-outline" size={13} color={Colors.successDark} />
                      <Text style={styles.detailClassBadgeText}>{className}</Text>
                    </View>
                  </View>

                  {/* Optional Notes */}
                  {detailStudent?.notes ? (
                    <View style={styles.detailNotesCard}>
                      <View style={styles.detailNotesHeader}>
                        <Ionicons name="document-text-outline" size={14} color={Colors.textSecondary} />
                        <Text style={styles.detailNotesLabel}>Öğrenci Notu / Açıklama</Text>
                      </View>
                      <Text style={styles.detailNotesText}>{detailStudent.notes}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Student Term Grade Summary */}
              {(() => {
                const currentGradeRow = gradebookData.students.find(
                  (r) => r.student_id === detailStudent?.id
                );
                return (
                  <View style={styles.detailGradeSection}>
                    <View style={styles.sectionHeaderRowBetween}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="calculator-outline" size={16} color={Colors.primary} />
                        <Text style={styles.detailSectionTitle}>
                          Not Durumu ({activeTerm}. Dönem)
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.detailGradeEditBtn}
                        onPress={() => {
                          if (currentGradeRow) {
                            handleOpenEditGrade(currentGradeRow);
                          } else if (detailStudent) {
                            handleOpenEditGrade({
                              student_id: detailStudent.id,
                              student_number: detailStudent.student_number,
                              first_name: detailStudent.first_name,
                              last_name: detailStudent.last_name,
                              quizScores: {},
                            });
                          }
                        }}
                      >
                        <Ionicons name="pencil" size={12} color={Colors.primary} />
                        <Text style={styles.detailGradeEditBtnText}>Not Gir / Düzenle</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.detailGradeGrid}>
                      <View style={styles.detailGradeBox}>
                        <Text style={styles.detailGradeBoxLabel}>Yazılılar</Text>
                        <Text style={styles.detailGradeBoxVal}>
                          {currentGradeRow?.exam1 ?? '-'} / {currentGradeRow?.exam2 ?? '-'} /{' '}
                          {currentGradeRow?.exam3 ?? '-'}
                        </Text>
                        <Text style={styles.detailGradeBoxSub}>
                          Ort: {currentGradeRow?.examAvg ?? '-'}
                        </Text>
                      </View>
                      <View style={styles.detailGradeBox}>
                        <Text style={styles.detailGradeBoxLabel}>Performans</Text>
                        <Text style={styles.detailGradeBoxVal}>
                          {currentGradeRow?.perf1 ?? '-'} / {currentGradeRow?.perf2 ?? '-'} /{' '}
                          {currentGradeRow?.perf3 ?? '-'}
                        </Text>
                        <Text style={styles.detailGradeBoxSub}>
                          Ort: {currentGradeRow?.perfAvg ?? '-'}
                        </Text>
                      </View>
                      <View style={styles.detailGradeBox}>
                        <Text style={styles.detailGradeBoxLabel}>Quizler</Text>
                        <Text style={styles.detailGradeBoxVal}>
                          {gradebookData.quizzes.length} Adet
                        </Text>
                        <Text style={styles.detailGradeBoxSub}>
                          Ort: {currentGradeRow?.quizAvg ?? '-'}
                        </Text>
                      </View>
                      <View style={[styles.detailGradeBox, styles.detailGradeBoxOverall]}>
                        <Text style={styles.detailGradeBoxLabelOverall}>Genel Ort.</Text>
                        <Text style={styles.detailGradeBoxValOverall}>
                          {currentGradeRow?.overallAvg ?? '-'}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()}

              {/* Quick Opinion Chips */}
              <View style={styles.detailSection}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="sparkles" size={16} color={Colors.warningDark} />
                  <Text style={styles.detailSectionTitle}>Hızlı Görüş Ekle</Text>
                </View>
                <Text style={styles.detailSectionSub}>
                  Dokunarak öğrenciye hızlıca görüş veya gözlem kaydedin:
                </Text>

                <View style={styles.chipsContainer}>
                  {[
                    'Derse katılımı harika ⭐',
                    'Ödevini eksiksiz yaptı ✍️',
                    'Ders içi konuşuyor ⚠️',
                    'Sorumlu ve düzenli 🌟',
                    'Konuyu tekrar etmeli 📖',
                    'Gelişim gösteriyor 📈',
                    'Ders araç gereçleri eksik 🎒',
                    'Örnek davranış sergiledi 👏',
                    ...quickNotesList.map((q) => q.text),
                  ]
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .map((chipText, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.chipButton}
                        onPress={() => handleAddNoteFromDetail(chipText)}
                        disabled={savingNote}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.chipButtonText}>{chipText}</Text>
                      </TouchableOpacity>
                    ))}
                </View>
              </View>

              {/* Custom Note Input */}
              {/* Custom Note Input */}
              <View style={styles.detailSection}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="create-outline" size={16} color={Colors.primary} />
                  <Text style={styles.detailSectionTitle}>Özel Görüş / Gözlem Yaz</Text>
                </View>

                {/* Lesson & Time Indicator */}
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

                <View style={styles.customNoteInputWrap}>
                  <Input
                    placeholder="Öğrenci hakkında gözlem veya görüşünüz..."
                    value={newNoteText}
                    onChangeText={setNewNoteText}
                    multiline
                    style={styles.customNoteInput}
                  />
                  <Button
                    title="Görüşü Kaydet"
                    icon="add-circle"
                    size="sm"
                    loading={savingNote}
                    disabled={!newNoteText.trim() || savingNote}
                    onPress={() => handleAddNoteFromDetail()}
                    style={{ marginTop: 8 }}
                  />
                </View>
              </View>

              {/* Existing Notes List */}
              <View style={styles.detailSection}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="chatbubbles-outline" size={16} color={Colors.textPrimary} />
                  <Text style={styles.detailSectionTitle}>
                    Kayıtlı Görüşler ({studentNotesList.length})
                  </Text>
                </View>

                {loadingNotes ? (
                  <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 12 }} />
                ) : studentNotesList.length === 0 ? (
                  <View style={styles.emptyNotesBox}>
                    <Text style={styles.emptyNotesText}>Henüz bu öğrenci için kaydedilmiş bir görüş yok.</Text>
                  </View>
                ) : (
                  studentNotesList.map((n) => (
                    <View key={n.id} style={styles.noteItemCard}>
                      <View style={styles.noteItemContent}>
                        <Text style={styles.noteItemText}>{n.note}</Text>
                        <View style={styles.noteMetaRow}>
                          <View style={styles.noteDateWrap}>
                            <Ionicons name="time-outline" size={11} color={Colors.textSecondary} />
                            <Text style={styles.noteItemDate}>
                              {new Date(n.created_at || Date.now()).toLocaleDateString('tr-TR', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </Text>
                          </View>
                          {n.lesson_info ? (
                            <View style={styles.noteLessonBadge}>
                              <Ionicons name="school" size={10} color="#047857" />
                              <Text style={styles.noteLessonBadgeText}>{n.lesson_info}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteNoteBtn}
                        onPress={() => handleDeleteNoteFromDetail(n.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={16} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>

              {/* Navigate to full notes history tab */}
              <TouchableOpacity
                style={styles.fullHistoryBtn}
                onPress={() => {
                  setDetailModalVisible(false);
                  if (detailStudent) {
                    navigation.navigate('StudentNotesTab', {
                      initialClassId: classId,
                      initialStudentId: detailStudent.id,
                    });
                  }
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="journal-outline" size={16} color={Colors.primary} />
                <Text style={styles.fullHistoryBtnText}>Tüm Görüş Geçmişi Sayfasına Git</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Single Student Grade Edit Modal */}
      <Modal visible={editGradeModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Not Girişi ({activeTerm}. Dönem)</Text>
                <Text style={styles.modalSubtitle}>
                  {editingGradeRow?.student_number ? `No: ${editingGradeRow.student_number} • ` : ''}
                  {editingGradeRow?.first_name} {editingGradeRow?.last_name}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEditGradeModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {/* Yazılı Sınavlar */}
              <View style={styles.gradeModalSection}>
                <View style={styles.gradeModalSectionTitleRow}>
                  <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
                  <Text style={styles.gradeModalSectionTitle}>Yazılı Sınav Notları (0 - 100)</Text>
                </View>
                <View style={styles.gradeModalInputRow}>
                  <View style={styles.gradeModalInputCol}>
                    <Text style={styles.gradeInputLabel}>1. Yazılı</Text>
                    <TextInput
                      style={styles.gradeScoreInput}
                      keyboardType="numeric"
                      placeholder="-"
                      placeholderTextColor={Colors.textMuted}
                      value={gradeInputs.exam1}
                      onChangeText={(t) => setGradeInputs((prev) => ({ ...prev, exam1: t }))}
                      maxLength={5}
                    />
                  </View>
                  <View style={styles.gradeModalInputCol}>
                    <Text style={styles.gradeInputLabel}>2. Yazılı</Text>
                    <TextInput
                      style={styles.gradeScoreInput}
                      keyboardType="numeric"
                      placeholder="-"
                      placeholderTextColor={Colors.textMuted}
                      value={gradeInputs.exam2}
                      onChangeText={(t) => setGradeInputs((prev) => ({ ...prev, exam2: t }))}
                      maxLength={5}
                    />
                  </View>
                  <View style={styles.gradeModalInputCol}>
                    <Text style={styles.gradeInputLabel}>3. Yazılı</Text>
                    <TextInput
                      style={styles.gradeScoreInput}
                      keyboardType="numeric"
                      placeholder="-"
                      placeholderTextColor={Colors.textMuted}
                      value={gradeInputs.exam3}
                      onChangeText={(t) => setGradeInputs((prev) => ({ ...prev, exam3: t }))}
                      maxLength={5}
                    />
                  </View>
                </View>
              </View>

              {/* Performans Notları */}
              <View style={styles.gradeModalSection}>
                <View style={styles.gradeModalSectionTitleRow}>
                  <Ionicons name="ribbon-outline" size={16} color={Colors.successDark} />
                  <Text style={styles.gradeModalSectionTitle}>Performans Notları (0 - 100)</Text>
                </View>
                <View style={styles.gradeModalInputRow}>
                  <View style={styles.gradeModalInputCol}>
                    <Text style={styles.gradeInputLabel}>1. Perf</Text>
                    <TextInput
                      style={styles.gradeScoreInput}
                      keyboardType="numeric"
                      placeholder="-"
                      placeholderTextColor={Colors.textMuted}
                      value={gradeInputs.perf1}
                      onChangeText={(t) => setGradeInputs((prev) => ({ ...prev, perf1: t }))}
                      maxLength={5}
                    />
                  </View>
                  <View style={styles.gradeModalInputCol}>
                    <Text style={styles.gradeInputLabel}>2. Perf</Text>
                    <TextInput
                      style={styles.gradeScoreInput}
                      keyboardType="numeric"
                      placeholder="-"
                      placeholderTextColor={Colors.textMuted}
                      value={gradeInputs.perf2}
                      onChangeText={(t) => setGradeInputs((prev) => ({ ...prev, perf2: t }))}
                      maxLength={5}
                    />
                  </View>
                  <View style={styles.gradeModalInputCol}>
                    <Text style={styles.gradeInputLabel}>3. Perf</Text>
                    <TextInput
                      style={styles.gradeScoreInput}
                      keyboardType="numeric"
                      placeholder="-"
                      placeholderTextColor={Colors.textMuted}
                      value={gradeInputs.perf3}
                      onChangeText={(t) => setGradeInputs((prev) => ({ ...prev, perf3: t }))}
                      maxLength={5}
                    />
                  </View>
                </View>
              </View>

              {/* Quiz Notları */}
              <View style={styles.gradeModalSection}>
                <View style={styles.gradeModalSectionTitleRow}>
                  <Ionicons name="flash-outline" size={16} color={Colors.warningDark} />
                  <Text style={styles.gradeModalSectionTitle}>Ders İçi Quizler ({gradebookData.quizzes.length})</Text>
                </View>
                {gradebookData.quizzes.length === 0 ? (
                  <Text style={styles.noQuizHint}>
                    Bu dönem için henüz quiz eklenmemiş. Not çizelgesi üzerindeki "+ Quiz" butonuyla dilediğiniz kadar quiz tanımlayabilirsiniz.
                  </Text>
                ) : (
                  <View style={styles.quizInputsGrid}>
                    {gradebookData.quizzes.map((q) => (
                      <View key={q.id} style={styles.quizInputItem}>
                        <Text style={styles.gradeInputLabel} numberOfLines={1}>{q.title}</Text>
                        <TextInput
                          style={styles.gradeScoreInput}
                          keyboardType="numeric"
                          placeholder="-"
                          placeholderTextColor={Colors.textMuted}
                          value={gradeInputs.quizScores[q.id] || ''}
                          onChangeText={(t) =>
                            setGradeInputs((prev) => ({
                              ...prev,
                              quizScores: { ...prev.quizScores, [q.id]: t },
                            }))
                          }
                          maxLength={5}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title="İptal"
                variant="outline"
                onPress={() => setEditGradeModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Notları Kaydet"
                onPress={handleSaveSingleGrade}
                loading={savingSingleGrade}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Quiz Modal */}
      <Modal visible={quizModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yeni Quiz Ekle ({activeTerm}. Dönem)</Text>
              <TouchableOpacity onPress={() => setQuizModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.quizModalHint}>
              Ders içinde yaptığınız kısa sınav, kelime testi, tarama vb. için bir başlık belirleyin. Sınıfın tüm öğrencilerine bu sütun eklenecektir.
            </Text>

            <Input
              label="Quiz / Tarama Başlığı"
              placeholder="Örn: Quiz 1, 1. Ünite Taraması..."
              value={quizTitleInput}
              onChangeText={setQuizTitleInput}
              autoFocus
            />

            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                onPress={() => setQuizModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Quiz Oluştur"
                onPress={handleSaveNewQuiz}
                loading={savingQuiz}
                style={{ flex: 1 }}
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  studentCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  studentCountBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  floatingActionPill: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 30,
    gap: 8,
    ...Shadows.large,
    elevation: 8,
    zIndex: 99,
  },
  fabIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPillText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  actionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  actionModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    ...Shadows.large,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#CBD5E1',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 14,
  },
  actionSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  actionSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  actionSheetSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  actionSheetCloseBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  actionSheetContent: {
    gap: 10,
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 14,
  },
  actionSheetIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetItemTextWrap: {
    flex: 1,
  },
  actionSheetItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  actionSheetItemDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  actionItemBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  actionItemBadgeText: {
    fontSize: 10,
    fontWeight: '700',
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
  closeSelectionBtn: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  closeSelectionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
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
    paddingBottom: 90,
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
    width: 56,
    height: 72,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1.5,
    borderColor: Colors.border,
    resizeMode: 'cover',
  },
  numberBadge: {
    width: 56,
    height: 72,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    gap: 2,
  },
  numberText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  zoomIconBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
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
  modalSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
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
  // PDF Photo Import Modal Styles
  pdfBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  pdfBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '600',
    lineHeight: 16,
  },
  pdfMatchScroll: {
    maxHeight: 340,
    marginBottom: 12,
  },
  pdfMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  pdfMatchThumb: {
    width: 48,
    height: 60,
    borderRadius: 6,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    resizeMode: 'cover',
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
  // Student Detail Modal Styles
  detailModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  detailModalContainer: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    minHeight: '75%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  detailModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailHeaderInfo: {
    flex: 1,
  },
  detailModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  detailModalSubTitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  detailModalCloseBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: Colors.cardSubtle,
  },
  detailModalBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  detailStudentCard: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    alignItems: 'center',
    ...Shadows.small,
  },
  detailPhotoWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  detailPhotoTouchWrap: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.cardSubtle,
    borderWidth: 2,
    borderColor: Colors.border,
    ...Shadows.medium,
  },
  detailPhotoLarge: {
    width: 200,
    height: 255,
    borderRadius: 14,
    backgroundColor: Colors.cardSubtle,
  },
  detailPhotoPlaceholder: {
    width: 200,
    height: 255,
    borderRadius: 14,
    backgroundColor: Colors.cardSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  detailPlaceholderNo: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  detailPhotoActionOverlay: {
    position: 'absolute',
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 5,
  },
  detailPhotoActionOverlayText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  detailStudentMetaUnder: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  detailStudentFullName: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  detailBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  detailNumberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  detailNumberBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  detailClassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  detailClassBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.successDark,
  },
  detailNotesCard: {
    width: '100%',
    backgroundColor: Colors.cardSubtle,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  detailNotesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  detailNotesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  detailNotesText: {
    fontSize: 12,
    color: Colors.textPrimary,
    lineHeight: 17,
  },
  detailSection: {
    marginBottom: 16,
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  detailSectionSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chipButton: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chipButtonText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  customNoteInputWrap: {
    marginTop: 4,
  },
  customNoteInput: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  emptyNotesBox: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  emptyNotesText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  noteItemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.card,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
    gap: 8,
  },
  noteItemContent: {
    flex: 1,
  },
  noteItemText: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  noteItemDate: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  noteMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  noteDateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  noteLessonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  noteLessonBadgeText: {
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
    marginBottom: 6,
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
    marginBottom: 6,
  },
  timeBannerText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  deleteNoteBtn: {
    padding: 4,
  },
  fullHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
    marginTop: 4,
  },
  fullHistoryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Segment Switch
  segmentSwitchWrap: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.cardSubtle,
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: Colors.primary,
  },
  segmentBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  segmentBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Gradebook Container & Control Bar
  gradebookContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  gradebookControlBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  termSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.cardSubtle,
    borderRadius: 8,
    padding: 3,
  },
  termBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  termBtnActive: {
    backgroundColor: Colors.primary,
  },
  termBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  termBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  gradeActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gradeActionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
  },
  gradeActionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gradeActionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
  },
  gradeActionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  gradeActionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSubtle,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  gradeActionBtnOutlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // Search & Summary
  gradeSearchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  gradeSearchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSubtle,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  gradeSearchTextInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    padding: 0,
  },
  gradebookSummaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  gradebookSummaryText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  gradebookHintText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },

  // Loading & Empty
  gradebookLoadingWrap: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  gradebookLoadingText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  gradebookEmptyWrap: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  gradebookEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
  },
  gradebookEmptySub: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },

  // Grade Table
  tableScrollX: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  tableScrollY: {
    flex: 1,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderBottomWidth: 2,
    borderBottomColor: '#94A3B8',
    minHeight: 40,
  },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    minHeight: 44,
    backgroundColor: '#FFFFFF',
  },
  tableDataRowEven: {
    backgroundColor: '#EDF2F7', // Belirgin zebra zıtlığı (açık kontrastlı gri/mavi ton)
  },
  thCell: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
    paddingVertical: 9,
    paddingHorizontal: 2,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  thCellClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
    gap: 2,
    backgroundColor: '#DBEAFE',
  },
  thQuizTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    maxWidth: 55,
  },
  tdCell: {
    fontSize: 12,
    color: '#0F172A',
    textAlign: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  tdNameWrap: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 8,
  },
  tdStudentName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },

  // Column Dimensions
  colNo: {
    width: 44,
  },
  colName: {
    width: 145,
  },
  colExam: {
    width: 46,
  },
  colPerf: {
    width: 46,
  },
  colQuiz: {
    width: 66,
  },
  colAvg: {
    width: 50,
  },
  colOverall: {
    width: 68,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Cell Backgrounds
  bgExamAvg: {
    backgroundColor: '#DBEAFE',
    color: '#1E40AF',
    fontWeight: '700',
  },
  bgPerfAvg: {
    backgroundColor: '#D1FAE5',
    color: '#065F46',
    fontWeight: '700',
  },
  bgQuizAvg: {
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    fontWeight: '700',
  },

  // Score Typography & Badges
  textEmptyScore: {
    color: Colors.textMuted,
  },
  textNormalScore: {
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  textHighScore: {
    color: '#047857',
    fontWeight: '700',
  },
  textFailScore: {
    color: '#DC2626',
    fontWeight: '700',
  },
  textBold: {
    fontWeight: '700',
  },
  overallBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Colors.cardSubtle,
    minWidth: 42,
    alignItems: 'center',
  },
  badgePass: {
    backgroundColor: '#D1FAE5',
  },
  badgeFail: {
    backgroundColor: '#FEE2E2',
  },
  overallText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  textPass: {
    color: '#047857',
  },
  textFail: {
    color: '#DC2626',
  },

  // Detail Modal Grade Section
  detailGradeSection: {
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.cardSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeaderRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailGradeEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
  },
  detailGradeEditBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  detailGradeGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  detailGradeBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
  },
  detailGradeBoxOverall: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  detailGradeBoxLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  detailGradeBoxLabelOverall: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 2,
  },
  detailGradeBoxVal: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  detailGradeBoxValOverall: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
  },
  detailGradeBoxSub: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // Edit Grade Modal
  gradeModalSection: {
    marginBottom: 16,
    backgroundColor: Colors.cardSubtle,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  gradeModalSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  gradeModalSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  gradeModalInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gradeModalInputCol: {
    flex: 1,
  },
  gradeInputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  gradeScoreInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    color: Colors.textPrimary,
  },
  noQuizHint: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  quizInputsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quizInputItem: {
    width: '48%',
  },
  quizModalHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 14,
    lineHeight: 18,
  },
});
