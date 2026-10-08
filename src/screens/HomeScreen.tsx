import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  StatusBar,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors, Shadows } from '../theme/colors';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { PdfViewerModal } from '../components/PdfViewerModal';
import {
  getActiveAndTodayLessons,
  ActiveLessonInfo,
  getScheduleByDay,
  mergeAndDetectConflicts,
  getShowAllSchoolsSetting,
  setShowAllSchoolsSetting,
} from '../database/operations/scheduleOperations';
import { getClasses } from '../database/operations/classOperations';
import { getAssignments } from '../database/operations/assignmentOperations';
import {
  getCurrentTopicForClass,
  getSurroundingTopicsForLesson,
  LessonTopicSurroundingInfo,
  getYearlyPlans,
  getYearlyPlanDocument,
  YearlyPlanDocument,
} from '../database/operations/yearlyPlanOperations';
import { viewYearlyPlanPdf } from '../utils/pdfPlanService';
import {
  DAYS_OF_WEEK,
  getDayOfWeekIndex,
  formatDateToTR,
  getCurrentTimeString,
  getTodayDateString,
  getDateForDayOfWeek,
  formatDateShortTR,
} from '../utils/dateUtils';
import { YearlyPlanItem, ScheduleItem, AgendaItem } from '../types';
import {
  getTodayAgendaItems,
  getAgendaItemsByDate,
  getTodayAlertItems,
  toggleAgendaItemCompleted,
  getPendingAgendaCountToday,
} from '../database/operations/agendaOperations';

import { School, getSchools, getActiveSchool, setActiveSchool, createSchool, SCHOOL_COLORS } from '../database/operations/schoolOperations';
import { useSchoolTheme } from '../context/SchoolThemeContext';

interface HeroNavTarget {
  day: number;
  lesson: ScheduleItem;
  dayLessons: ScheduleItem[];
  index: number;
}

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { reloadSchoolTheme, bgTint } = useSchoolTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(getCurrentTimeString());

  // --- SCHOOL MANAGEMENT STATE ---
  const [activeSchool, setActiveSchoolState] = useState<School | null>(null);
  const [schoolsList, setSchoolsList] = useState<School[]>([]);
  const [schoolModalVisible, setSchoolModalVisible] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolColor, setNewSchoolColor] = useState(SCHOOL_COLORS[0].color);
  const [isAddingSchool, setIsAddingSchool] = useState(false);

  // Edit / Delete School State
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [editSchoolName, setEditSchoolName] = useState('');
  const [editSchoolColor, setEditSchoolColor] = useState(SCHOOL_COLORS[0].color);

  const todayIndex = getDayOfWeekIndex();
  const [selectedDay, setSelectedDay] = useState<number>(todayIndex);
  const [displayedLessons, setDisplayedLessons] = useState<ScheduleItem[]>([]);
  const [showAllSchoolsSchedule, setShowAllSchoolsSchedule] = useState(false);

  const loadSchools = async () => {
    try {
      const active = await getActiveSchool();
      setActiveSchoolState(active);
      const list = await getSchools();
      setSchoolsList(list);
      await reloadSchoolTheme();
      const savedSetting = await getShowAllSchoolsSetting();
      setShowAllSchoolsSchedule(savedSetting);
    } catch (e) {
      console.warn('Error loading schools:', e);
    }
  };

  const handleExitApp = () => {
    Alert.alert(
      'Uygulamayı Kapat',
      'Uygulamadan çıkmak istediğinize emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Kapat',
          style: 'destructive',
          onPress: () => BackHandler.exitApp(),
        },
      ],
      { cancelable: true }
    );
  };

  const handleToggleShowAllSchools = async (val: boolean) => {
    setShowAllSchoolsSchedule(val);
    await setShowAllSchoolsSetting(val);
    await loadDaySchedule(selectedDay, val);
  };

  const handleSelectSchool = async (schoolId: number) => {
    try {
      const updated = await setActiveSchool(schoolId);
      setActiveSchoolState(updated);
      await reloadSchoolTheme();
      setSchoolModalVisible(false);
      await loadData();
    } catch (e) {
      Alert.alert('Hata', 'Okul değiştirilemedi.');
    }
  };

  const handleCreateSchool = async () => {
    if (!newSchoolName.trim()) {
      Alert.alert('Uyarı', 'Lütfen okul adını giriniz.');
      return;
    }
    try {
      await createSchool(newSchoolName, newSchoolColor);
      setNewSchoolName('');
      setIsAddingSchool(false);
      await loadSchools();
      await loadData();
    } catch (e) {
      Alert.alert('Hata', 'Okul eklenirken bir hata oluştu.');
    }
  };

  const handleStartEditSchool = (sch: School) => {
    setEditingSchool(sch);
    setEditSchoolName(sch.name);
    setEditSchoolColor(sch.color || SCHOOL_COLORS[0].color);
  };

  const handleSaveEditSchool = async () => {
    if (!editingSchool || !editSchoolName.trim()) {
      Alert.alert('Uyarı', 'Lütfen okul adını giriniz.');
      return;
    }
    try {
      const { updateSchool } = await import('../database/operations/schoolOperations');
      await updateSchool(editingSchool.id, editSchoolName, editSchoolColor);
      setEditingSchool(null);
      await loadSchools();
      await loadData();
    } catch (e) {
      Alert.alert('Hata', 'Okul güncellenirken hata oluştu.');
    }
  };

  const handleDeleteSchoolHandler = async (sch: School) => {
    if (schoolsList.length <= 1) {
      Alert.alert('Uyarı', 'Sistemde en az bir okul bulunmalıdır, son okul silinemez.');
      return;
    }
    Alert.alert(
      'Okulu Sil',
      `"${sch.name}" okulunu silmek istediğinize emin misiniz? Okula ait tüm şubeler ve kayıtlar da silinecektir.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              const { deleteSchool } = await import('../database/operations/schoolOperations');
              await deleteSchool(sch.id);
              await loadSchools();
              await loadData();
            } catch (e: any) {
              Alert.alert('Hata', e?.message || 'Okul silinemedi.');
            }
          },
        },
      ]
    );
  };

  const [lessonInfo, setLessonInfo] = useState<ActiveLessonInfo>({
    currentLesson: null,
    nextLesson: null,
    todayLessons: [],
  });
  const [heroNavTarget, setHeroNavTarget] = useState<HeroNavTarget | null>(null);
  const [heroTopic, setHeroTopic] = useState<YearlyPlanItem | null>(null);
  const [heroTopicLoading, setHeroTopicLoading] = useState(false);
  const [stats, setStats] = useState({
    classCount: 0,
    studentCount: 0,
    pendingAssignments: 0,
  });

  // --- AGENDA & REMINDERS STATE ---
  const [selectedDayAgendaItems, setSelectedDayAgendaItems] = useState<AgendaItem[]>([]);
  const [todayAlertItems, setTodayAlertItems] = useState<AgendaItem[]>([]);
  const [pendingAgendaCount, setPendingAgendaCount] = useState<number>(0);

  const loadAgendaData = async (targetDate?: string) => {
    try {
      const dateToLoad = targetDate || getDateForDayOfWeek(selectedDay);
      const items = await getAgendaItemsByDate(dateToLoad, activeSchool?.id);
      setSelectedDayAgendaItems(items);
      const alerts = await getTodayAlertItems(activeSchool?.id);
      setTodayAlertItems(alerts);
      const pendingCount = await getPendingAgendaCountToday(activeSchool?.id);
      setPendingAgendaCount(pendingCount);
    } catch (e) {
      console.warn('Error loading agenda data in HomeScreen:', e);
    }
  };

  // --- TOPIC (DEFTERE YAZILACAK METİN) MODAL STATE ---
  const [topicModalVisible, setTopicModalVisible] = useState(false);
  const [topicLoading, setTopicLoading] = useState(false);
  const [topicInfo, setTopicInfo] = useState<LessonTopicSurroundingInfo | null>(null);
  const [selectedTopicIndex, setSelectedTopicIndex] = useState<number>(0);

  // --- YEARLY PLAN POPUP MODAL STATE ---
  const [yearlyPlanModalVisible, setYearlyPlanModalVisible] = useState(false);
  const [yearlyPlanLoading, setYearlyPlanLoading] = useState(false);
  const [yearlyPlanList, setYearlyPlanList] = useState<YearlyPlanItem[]>([]);
  const [yearlyPlanPdf, setYearlyPlanPdf] = useState<YearlyPlanDocument | null>(null);
  const [yearlyPlanMeta, setYearlyPlanMeta] = useState<{
    gradeLevel: number;
    className: string;
    courseName: string;
    courseId: number;
  } | null>(null);
  const [planSearchQuery, setPlanSearchQuery] = useState('');
  const [planDateStart, setPlanDateStart] = useState('');
  const [planDateEnd, setPlanDateEnd] = useState('');
  const [showPlanDatePicker, setShowPlanDatePicker] = useState<'start' | 'end' | null>(null);
  const [pdfViewerModalVisible, setPdfViewerModalVisible] = useState(false);

  // Yearly plan scroll & highlight refs
  const planScrollRef = useRef<ScrollView>(null);
  const planItemOffsets = useRef<Record<number, number>>({});
  const [highlightedPlanId, setHighlightedPlanId] = useState<number | null>(null);

  const loadDaySchedule = async (day: number, overrideShowAll?: boolean) => {
    try {
      const showAll = overrideShowAll !== undefined ? overrideShowAll : showAllSchoolsSchedule;
      const items = await getScheduleByDay(day, showAll ? 'all' : undefined);
      const valid = items.filter((item) => item.class_id || item.course_id);
      if (showAll) {
        setDisplayedLessons(mergeAndDetectConflicts(valid, activeSchool?.id));
      } else {
        setDisplayedLessons(valid);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAssignedLessonsForDay = async (day: number, overrideShowAll?: boolean): Promise<ScheduleItem[]> => {
    try {
      const showAll = overrideShowAll !== undefined ? overrideShowAll : showAllSchoolsSchedule;
      const items = await getScheduleByDay(day, showAll ? 'all' : undefined);
      const valid = items.filter((item) => item.class_id || item.course_id);
      if (showAll) {
        return mergeAndDetectConflicts(valid, activeSchool?.id);
      }
      return valid;
    } catch (err) {
      console.error('Error fetching lessons for day', day, err);
      return [];
    }
  };

  const findNextDayWithLessons = async (
    startDay: number,
    overrideShowAll?: boolean
  ): Promise<{ day: number; lessons: ScheduleItem[] } | null> => {
    for (let offset = 1; offset <= 7; offset++) {
      const nextDay = ((startDay - 1 + offset) % 7) + 1;
      const lessons = await fetchAssignedLessonsForDay(nextDay, overrideShowAll);
      if (lessons.length > 0) {
        return { day: nextDay, lessons };
      }
    }
    return null;
  };

  const findPrevDayWithLessons = async (
    startDay: number,
    overrideShowAll?: boolean
  ): Promise<{ day: number; lessons: ScheduleItem[] } | null> => {
    for (let offset = 1; offset <= 7; offset++) {
      let prevDay = startDay - offset;
      while (prevDay <= 0) prevDay += 7;
      const lessons = await fetchAssignedLessonsForDay(prevDay, overrideShowAll);
      if (lessons.length > 0) {
        return { day: prevDay, lessons };
      }
    }
    return null;
  };

  const loadData = async (dayToLoad?: number) => {
    try {
      setCurrentTime(getCurrentTimeString());
      const savedSetting = await getShowAllSchoolsSetting();
      setShowAllSchoolsSchedule(savedSetting);
      const targetDay = dayToLoad !== undefined ? dayToLoad : selectedDay;
      const info = await getActiveAndTodayLessons(savedSetting ? 'all' : undefined);
      setLessonInfo(info);
      await loadDaySchedule(targetDay, savedSetting);

      const classes = await getClasses();
      const totalStudents = classes.reduce((sum, c) => sum + (c.student_count || 0), 0);
      const assignments = await getAssignments();
      const pendingCount = assignments.reduce((sum, a) => sum + (a.pending_count || 0), 0);

      setStats({
        classCount: classes.length,
        studentCount: totalStudents,
        pendingAssignments: pendingCount,
      });

      await loadAgendaData();
    } catch (error) {
      console.error('Error loading home data:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      const currentDay = getDayOfWeekIndex();
      setSelectedDay(currentDay);
      setHeroNavTarget(null);
      loadData(currentDay);
      const interval = setInterval(() => {
        setCurrentTime(getCurrentTimeString());
        getActiveAndTodayLessons(showAllSchoolsSchedule ? 'all' : undefined).then(async (info) => {
          setLessonInfo(info);
        });
      }, 30000); // 30 sec tick
      return () => clearInterval(interval);
    }, [showAllSchoolsSchedule])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    const currentDay = getDayOfWeekIndex();
    setSelectedDay(currentDay);
    setHeroNavTarget(null);
    await loadData(currentDay);
    setRefreshing(false);
  };

  useEffect(() => {
    loadDaySchedule(selectedDay);
    const dateStr = getDateForDayOfWeek(selectedDay);
    loadAgendaData(dateStr);
  }, [selectedDay]);

  const handlePrevDay = () => {
    setSelectedDay((prev) => (prev <= 1 ? 7 : prev - 1));
  };

  const handleNextDay = () => {
    setSelectedDay((prev) => (prev >= 7 ? 1 : prev + 1));
  };

  const handleJumpToToday = () => {
    setSelectedDay(todayIndex);
    setHeroNavTarget(null);
  };

  const handleJumpToCurrentDayAndLesson = async () => {
    const currentDay = getDayOfWeekIndex();
    setSelectedDay(currentDay);
    setHeroNavTarget(null);
    await loadDaySchedule(currentDay);
    try {
      const info = await getActiveAndTodayLessons(showAllSchoolsSchedule ? 'all' : undefined);
      setLessonInfo(info);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenTopicModal = async (item: ScheduleItem) => {
    if (!item.class_id || !item.course_id) {
      Alert.alert('Bilgi', 'Bu ders için şube veya ders bilgisi tanımlı değil.');
      return;
    }
    setTopicLoading(true);
    setTopicModalVisible(true);
    try {
      const res = await getSurroundingTopicsForLesson(
        item.class_id,
        item.course_id,
        item.day_of_week,
        item.slot_id
      );
      setTopicInfo(res);
      setSelectedTopicIndex(res.currentIndex >= 0 ? res.currentIndex : 0);
    } catch (e) {
      console.error('Error loading surrounding topics:', e);
      Alert.alert('Hata', 'Defter metni yüklenirken bir sorun oluştu.');
    } finally {
      setTopicLoading(false);
    }
  };

  const handleCopyNotebookText = async (text: string) => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    Alert.alert('Kopyalandı', 'Deftere yazılacak metin panoya kopyalandı.');
  };

  const handleOpenYearlyPlanModal = async (item: ScheduleItem) => {
    const m = item.class_name?.match(/\d+/);
    const gradeLevel = m ? parseInt(m[0], 10) : 0;
    const meta = {
      gradeLevel,
      className: item.class_name || '',
      courseName: item.course_name || 'Ders',
      courseId: item.course_id || 0,
    };
    setYearlyPlanMeta(meta);
    setPlanSearchQuery('');
    setPlanDateStart('');
    setPlanDateEnd('');
    setYearlyPlanLoading(true);
    setYearlyPlanModalVisible(true);
    planItemOffsets.current = {};
    setHighlightedPlanId(null);

    try {
      // 1. Şubeye özel değil sınıf düzeyine ait planı ara (class_id göndermeden)
      let plans = await getYearlyPlans(item.course_id || undefined, gradeLevel || undefined);

      // 2. Yedek: Eğer ders eşleşmediyse, o sınıf düzeyine yüklenmiş tüm planları dene
      if (plans.length === 0 && gradeLevel) {
        plans = await getYearlyPlans(undefined, gradeLevel);
      }

      // 3. Yedek: Eğer sınıf düzeyi çıkmadıysa ders id ile ara
      if (plans.length === 0 && item.course_id) {
        plans = await getYearlyPlans(item.course_id, undefined);
      }

      // PDF belgesini kontrol et
      const doc = await getYearlyPlanDocument(item.course_id || undefined, gradeLevel || undefined);

      setYearlyPlanList(plans);
      setYearlyPlanPdf(doc);

      // Başlangıç tarihi varsayılanı: Yıllık planın başladığı ilk hafta tarihi
      const firstWeekStart = plans.find((p) => p.date_start)?.date_start;
      if (firstWeekStart) {
        setPlanDateStart(firstWeekStart);
        // Bitiş tarihi varsayılanı: Tam 1 yıl sonrası
        const sDate = new Date(firstWeekStart);
        if (!isNaN(sDate.getTime())) {
          sDate.setFullYear(sDate.getFullYear() + 1);
          setPlanDateEnd(sDate.toISOString().split('T')[0]);
        } else {
          setPlanDateEnd('');
        }
      } else {
        const todayStr = new Date().toISOString().split('T')[0];
        setPlanDateStart(todayStr);
        const nextYearDate = new Date();
        nextYearDate.setFullYear(nextYearDate.getFullYear() + 1);
        setPlanDateEnd(nextYearDate.toISOString().split('T')[0]);
      }
    } catch (e) {
      console.error('Error loading yearly plan:', e);
      Alert.alert('Hata', 'Yıllık plan yüklenirken bir sorun oluştu.');
    } finally {
      setYearlyPlanLoading(false);
    }
  };

  const getClosestPlanItem = (plans: YearlyPlanItem[]): YearlyPlanItem | null => {
    if (!plans || plans.length === 0) return null;
    const todayStr = getTodayDateString();
    const todayTime = new Date(todayStr).getTime();

    // 1. Doğrudan bu haftaya denk gelen kazanım
    const exactMatch = plans.find(
      (p) => Boolean(p.date_start && p.date_end && p.date_start <= todayStr && p.date_end >= todayStr)
    );
    if (exactMatch) return exactMatch;

    // 2. Bugünün tarihine gün farkı olarak en yakın kazanım
    let closestPlan: YearlyPlanItem | null = null;
    let minDiff = Infinity;

    for (const p of plans) {
      if (p.date_start && p.date_end) {
        const startTime = new Date(p.date_start).getTime();
        const endTime = new Date(p.date_end).getTime();
        let diff = 0;
        if (todayTime < startTime) {
          diff = startTime - todayTime;
        } else if (todayTime > endTime) {
          diff = todayTime - endTime;
        } else {
          diff = 0;
        }
        if (diff < minDiff) {
          minDiff = diff;
          closestPlan = p;
        }
      } else if (p.date_start) {
        const diff = Math.abs(todayTime - new Date(p.date_start).getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closestPlan = p;
        }
      } else if (p.date_end) {
        const diff = Math.abs(todayTime - new Date(p.date_end).getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closestPlan = p;
        }
      }
    }

    return closestPlan || plans[0] || null;
  };

  const handleScrollToTodayPlan = () => {
    if (!yearlyPlanList || yearlyPlanList.length === 0) return;

    // Filtreleme yapmadan, tüm listede rahatça yukarı-aşağı kaydırılabilmesi için arama/tarih filtresini sıfırlar
    let needFilterReset = false;
    if (planSearchQuery) {
      setPlanSearchQuery('');
      needFilterReset = true;
    }
    const todayStr = getTodayDateString();
    if (planDateStart && planDateEnd) {
      if (planDateStart > todayStr || planDateEnd < todayStr) {
        const firstWeekStart = yearlyPlanList.find((p) => p.date_start)?.date_start;
        if (firstWeekStart) {
          setPlanDateStart(firstWeekStart);
          try {
            const sDate = new Date(firstWeekStart);
            sDate.setFullYear(sDate.getFullYear() + 1);
            setPlanDateEnd(sDate.toISOString().split('T')[0]);
          } catch {
            setPlanDateEnd('');
          }
        } else {
          setPlanDateStart('');
          setPlanDateEnd('');
        }
        needFilterReset = true;
      }
    }

    const targetPlan = getClosestPlanItem(yearlyPlanList);
    if (!targetPlan) return;

    setHighlightedPlanId(targetPlan.id);
    setTimeout(() => {
      setHighlightedPlanId(null);
    }, 3000);

    const performScroll = () => {
      const y = planItemOffsets.current[targetPlan.id];
      if (y !== undefined && planScrollRef.current) {
        planScrollRef.current.scrollTo({
          y: Math.max(0, y - 10),
          animated: true,
        });
      }
    };

    if (needFilterReset) {
      setTimeout(performScroll, 120);
    } else {
      performScroll();
      setTimeout(performScroll, 120);
    }
  };

  // --- HERO CARD (ACTIVE/NAVIGATED LESSON) COMPUTED & STATE ---
  const todayLessons = lessonInfo.todayLessons || [];
  const currentActiveIndex = lessonInfo.currentLesson
    ? todayLessons.findIndex((item) => item.slot_id === lessonInfo.currentLesson?.slot_id)
    : -1;

  // Gezinme hedefi varsa o ders gösterilir.
  // Gezinme hedefi yoksa SADECE o an devam eden aktif ders gösterilir.
  // Eğer o an ders yoksa effectiveHeroLesson = null olur ve 'Şu An Boş Ders' kartı gösterilir!
  const effectiveHeroLesson: ScheduleItem | null = heroNavTarget
    ? heroNavTarget.lesson
    : (lessonInfo.currentLesson || null);

  const heroDay = heroNavTarget ? heroNavTarget.day : todayIndex;
  const isHeroToday = heroDay === todayIndex;
  const heroDayObj = DAYS_OF_WEEK.find((d) => d.id === heroDay);
  const heroDayName = heroDayObj ? heroDayObj.name : '';

  const isCurrentLesson = Boolean(
    lessonInfo.currentLesson &&
    effectiveHeroLesson &&
    effectiveHeroLesson.slot_id === lessonInfo.currentLesson.slot_id &&
    isHeroToday &&
    !heroNavTarget
  );

  const isNextLesson = Boolean(
    !lessonInfo.currentLesson &&
    lessonInfo.nextLesson &&
    effectiveHeroLesson &&
    effectiveHeroLesson.slot_id === lessonInfo.nextLesson.slot_id &&
    isHeroToday &&
    !heroNavTarget
  );

  const heroDisplayIndex = heroNavTarget
    ? heroNavTarget.index
    : currentActiveIndex >= 0
    ? currentActiveIndex
    : 0;

  const heroDisplayTotal = heroNavTarget
    ? heroNavTarget.dayLessons.length
    : todayLessons.length;

  useEffect(() => {
    let isMounted = true;
    if (!effectiveHeroLesson || !effectiveHeroLesson.class_id) {
      setHeroTopic(null);
      setHeroTopicLoading(false);
      return;
    }

    setHeroTopicLoading(true);
    getCurrentTopicForClass(
      effectiveHeroLesson.class_id,
      effectiveHeroLesson.course_id || undefined,
      effectiveHeroLesson.day_of_week,
      effectiveHeroLesson.slot_id
    )
      .then((topic) => {
        if (isMounted) {
          setHeroTopic(topic);
          setHeroTopicLoading(false);
        }
      })
      .catch((err) => {
        console.error('Error loading hero topic:', err);
        if (isMounted) {
          setHeroTopic(null);
          setHeroTopicLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    effectiveHeroLesson?.id,
    effectiveHeroLesson?.slot_id,
    effectiveHeroLesson?.class_id,
    effectiveHeroLesson?.course_id,
    effectiveHeroLesson?.day_of_week,
  ]);

  const handleNextHeroLesson = async () => {
    const currentDay = getDayOfWeekIndex();
    const cTime = getCurrentTimeString();
    const todayAssigned = lessonInfo.todayLessons || [];

    // Durum 1: Halihazırda gezinilen bir dersteysek
    if (heroNavTarget) {
      const { day, dayLessons, index } = heroNavTarget;
      if (index < dayLessons.length - 1) {
        // Aynı gün içinde bir sonraki ders
        const nextIndex = index + 1;
        setHeroNavTarget({
          day,
          dayLessons,
          index: nextIndex,
          lesson: dayLessons[nextIndex],
        });
        return;
      }
      // Bu günün son dersindeyiz -> en yakın sonraki günün ilk dersine git
      const nextResult = await findNextDayWithLessons(day);
      if (nextResult && nextResult.lessons.length > 0) {
        setSelectedDay(nextResult.day);
        setHeroNavTarget({
          day: nextResult.day,
          dayLessons: nextResult.lessons,
          index: 0,
          lesson: nextResult.lessons[0],
        });
      }
      return;
    }

    // Durum 2: "Şu An" modundayız ve şu anda devam eden bir aktif ders var
    if (lessonInfo.currentLesson) {
      const curIdx = todayAssigned.findIndex((item) => item.slot_id === lessonInfo.currentLesson?.slot_id);
      if (curIdx !== -1 && curIdx < todayAssigned.length - 1) {
        // Bugün içindeki bir sonraki ders
        const nextIndex = curIdx + 1;
        setHeroNavTarget({
          day: currentDay,
          dayLessons: todayAssigned,
          index: nextIndex,
          lesson: todayAssigned[nextIndex],
        });
        return;
      }
      // Bugünün son dersindeydik -> sonraki günün ilk dersine git
      const nextResult = await findNextDayWithLessons(currentDay);
      if (nextResult && nextResult.lessons.length > 0) {
        setSelectedDay(nextResult.day);
        setHeroNavTarget({
          day: nextResult.day,
          dayLessons: nextResult.lessons,
          index: 0,
          lesson: nextResult.lessons[0],
        });
      }
      return;
    }

    // Durum 3: "Şu An Boş Ders" formundayız (şu an ders yok)
    // En yakın sıradaki derse git
    if (lessonInfo.nextLesson) {
      const nextIdx = todayAssigned.findIndex((item) => item.slot_id === lessonInfo.nextLesson?.slot_id);
      if (nextIdx !== -1) {
        setHeroNavTarget({
          day: currentDay,
          dayLessons: todayAssigned,
          index: nextIdx,
          lesson: todayAssigned[nextIdx],
        });
        return;
      }
    }

    // Ya da bugün saati cTime'dan büyük olan herhangi bir ders
    const upcomingIdx = todayAssigned.findIndex((item) => Boolean(item.start_time && item.start_time > cTime));
    if (upcomingIdx !== -1) {
      setHeroNavTarget({
        day: currentDay,
        dayLessons: todayAssigned,
        index: upcomingIdx,
        lesson: todayAssigned[upcomingIdx],
      });
      return;
    }

    // Bugün başka ders kalmadıysa -> sonraki günlerin ilk dersine git
    const nextResult = await findNextDayWithLessons(currentDay);
    if (nextResult && nextResult.lessons.length > 0) {
      setSelectedDay(nextResult.day);
      setHeroNavTarget({
        day: nextResult.day,
        dayLessons: nextResult.lessons,
        index: 0,
        lesson: nextResult.lessons[0],
      });
    }
  };

  const handlePrevHeroLesson = async () => {
    const currentDay = getDayOfWeekIndex();
    const cTime = getCurrentTimeString();
    const todayAssigned = lessonInfo.todayLessons || [];

    // Durum 1: Halihazırda gezinilen bir dersteysek
    if (heroNavTarget) {
      const { day, dayLessons, index } = heroNavTarget;
      if (index > 0) {
        // Aynı gün içinde bir önceki ders
        const prevIndex = index - 1;
        setHeroNavTarget({
          day,
          dayLessons,
          index: prevIndex,
          lesson: dayLessons[prevIndex],
        });
        return;
      }
      // Bu günün ilk dersindeyiz -> en yakın önceki günün son dersine git
      const prevResult = await findPrevDayWithLessons(day);
      if (prevResult && prevResult.lessons.length > 0) {
        const lastIdx = prevResult.lessons.length - 1;
        setSelectedDay(prevResult.day);
        setHeroNavTarget({
          day: prevResult.day,
          dayLessons: prevResult.lessons,
          index: lastIdx,
          lesson: prevResult.lessons[lastIdx],
        });
      }
      return;
    }

    // Durum 2: "Şu An" modundayız ve şu anda devam eden bir aktif ders var
    if (lessonInfo.currentLesson) {
      const curIdx = todayAssigned.findIndex((item) => item.slot_id === lessonInfo.currentLesson?.slot_id);
      if (curIdx > 0) {
        // Bugün içindeki bir önceki ders
        const prevIndex = curIdx - 1;
        setHeroNavTarget({
          day: currentDay,
          dayLessons: todayAssigned,
          index: prevIndex,
          lesson: todayAssigned[prevIndex],
        });
        return;
      }
      // Bugünün ilk dersindeydik -> önceki günün son dersine git
      const prevResult = await findPrevDayWithLessons(currentDay);
      if (prevResult && prevResult.lessons.length > 0) {
        const lastIdx = prevResult.lessons.length - 1;
        setSelectedDay(prevResult.day);
        setHeroNavTarget({
          day: prevResult.day,
          dayLessons: prevResult.lessons,
          index: lastIdx,
          lesson: prevResult.lessons[lastIdx],
        });
      }
      return;
    }

    // Durum 3: "Şu An Boş Ders" formundayız (şu an ders yok)
    // Bugün daha önce bitmiş ders varsa en son biten derse git
    let lastPastIdx = -1;
    for (let i = todayAssigned.length - 1; i >= 0; i--) {
      if (todayAssigned[i].end_time && todayAssigned[i].end_time! <= cTime) {
        lastPastIdx = i;
        break;
      }
    }

    if (lastPastIdx !== -1) {
      setHeroNavTarget({
        day: currentDay,
        dayLessons: todayAssigned,
        index: lastPastIdx,
        lesson: todayAssigned[lastPastIdx],
      });
      return;
    }

    // Bugün geçmiş ders yoksa (örneğin sabah erken veya bugün ders yok) -> önceki günlerin son dersine git
    const prevResult = await findPrevDayWithLessons(currentDay);
    if (prevResult && prevResult.lessons.length > 0) {
      const lastIdx = prevResult.lessons.length - 1;
      setSelectedDay(prevResult.day);
      setHeroNavTarget({
        day: prevResult.day,
        dayLessons: prevResult.lessons,
        index: lastIdx,
        lesson: prevResult.lessons[lastIdx],
      });
    }
  };

  const currentTopicItem = topicInfo?.allTopics[selectedTopicIndex] || null;
  const prevTopics = topicInfo
    ? [
        selectedTopicIndex - 2 >= 0
          ? { offset: -2, item: topicInfo.allTopics[selectedTopicIndex - 2] }
          : null,
        selectedTopicIndex - 1 >= 0
          ? { offset: -1, item: topicInfo.allTopics[selectedTopicIndex - 1] }
          : null,
      ].filter(Boolean) as { offset: number; item: YearlyPlanItem }[]
    : [];
  const nextTopics = topicInfo
    ? [
        selectedTopicIndex + 1 < topicInfo.allTopics.length
          ? { offset: 1, item: topicInfo.allTopics[selectedTopicIndex + 1] }
          : null,
        selectedTopicIndex + 2 < topicInfo.allTopics.length
          ? { offset: 2, item: topicInfo.allTopics[selectedTopicIndex + 2] }
          : null,
      ].filter(Boolean) as { offset: number; item: YearlyPlanItem }[]
    : [];

  const filteredPlanList = yearlyPlanList.filter((p) => {
    if (planSearchQuery.trim()) {
      const q = planSearchQuery.toLowerCase();
      const matchText =
        p.subject_topic.toLowerCase().includes(q) ||
        (p.learning_outcomes && p.learning_outcomes.toLowerCase().includes(q)) ||
        `hafta ${p.week_number}`.includes(q) ||
        `${p.week_number}. hafta`.includes(q) ||
        (p.date_start && p.date_start.includes(q)) ||
        (p.date_end && p.date_end.includes(q));
      if (!matchText) return false;
    }
    if (planDateStart.trim() && p.date_end && p.date_end < planDateStart.trim()) return false;
    if (planDateEnd.trim() && p.date_start && p.date_start > planDateEnd.trim()) return false;
    return true;
  });

  const isViewingToday = selectedDay === todayIndex;
  const selectedDayObj = DAYS_OF_WEEK.find((d) => d.id === selectedDay);
  const selectedDateString = useMemo(() => {
    return getDateForDayOfWeek(selectedDay);
  }, [selectedDay]);
  const todayName = DAYS_OF_WEEK.find((d) => d.id === todayIndex)?.name || 'Bugün';

  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 20
  );

  const schoolBgTint = activeSchool?.color ? `${activeSchool.color}0E` : Colors.background;

  return (
    <View style={{ flex: 1, backgroundColor: schoolBgTint }}>
      <ScrollView
        style={[styles.container, { backgroundColor: schoolBgTint }]}
        contentContainerStyle={[styles.contentContainer, { paddingTop: topInset + 2 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
      {/* Top Welcome Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topBarLeft}
          onPress={() => {
            loadSchools();
            setEditingSchool(null);
            setIsAddingSchool(false);
            setSchoolModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.dateText}>
                {todayName}, {formatDateToTR(new Date().toISOString().split('T')[0])}
              </Text>
              <Ionicons name="swap-horizontal" size={11} color={Colors.textMuted} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text
                style={[styles.greetingTitle, { color: activeSchool?.color || Colors.textPrimary }]}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.7}
              >
                {activeSchool?.name || 'Sınıf Takip & Ajanda'}
              </Text>
              <Ionicons name="chevron-down-circle" size={15} color={activeSchool?.color || Colors.primary} />
            </View>
          </View>
        </TouchableOpacity>

        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* Ajanda Kısayol Butonu + Rozet */}
            <TouchableOpacity
              style={styles.settingsHeaderBtn}
              onPress={() => navigation.navigate('Agenda')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar-outline" size={17} color={activeSchool?.color || Colors.primary} />
              {pendingAgendaCount > 0 && (
                <View style={styles.headerAgendaBadge}>
                  <Text style={styles.headerAgendaBadgeText}>
                    {pendingAgendaCount > 9 ? '9+' : pendingAgendaCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsHeaderBtn}
              onPress={() => navigation.navigate('Operations')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="options-outline" size={18} color={activeSchool?.color || Colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingsHeaderBtn, styles.exitHeaderBtn]}
              onPress={handleExitApp}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="power" size={16} color={Colors.danger} />
            </TouchableOpacity>
          </View>

          <View style={styles.clockBadge}>
            <Ionicons name="time-outline" size={12} color={activeSchool?.color || Colors.primary} />
            <Text style={[styles.clockText, { color: activeSchool?.color || Colors.primary }]}>{currentTime}</Text>
          </View>
        </View>
      </View>

      {/* 🚨 TÜM GÜN EKRANDA UYARI KARTI (Günün Kritik Ajanda / Hatırlatma Notları) */}
      {todayAlertItems.length > 0 && (
        <View style={styles.alertBannerContainer}>
          {todayAlertItems.map((alertItem) => (
            <TouchableOpacity
              key={alertItem.id}
              style={[
                styles.alertBannerCard,
                alertItem.priority === 'acil' ? styles.alertBannerCardUrgent : null,
              ]}
              onPress={() => navigation.navigate('Agenda')}
              activeOpacity={0.85}
            >
              <View style={styles.alertBannerLeft}>
                <View
                  style={[
                    styles.alertIconWrap,
                    alertItem.priority === 'acil' ? { backgroundColor: '#FEE2E2' } : null,
                  ]}
                >
                  <Ionicons
                    name={alertItem.priority === 'acil' ? 'flame' : 'alert-circle'}
                    size={20}
                    color={alertItem.priority === 'acil' ? '#DC2626' : '#D97706'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.alertHeaderRow}>
                    <Text
                      style={[
                        styles.alertBadgeText,
                        alertItem.priority === 'acil' ? { color: '#DC2626' } : null,
                      ]}
                    >
                      {alertItem.priority === 'acil' ? '🚨 ACİL DİKKAT' : '🔔 GÜNÜN UYARISI'}
                    </Text>
                    {alertItem.has_time === 1 && alertItem.time ? (
                      <View style={styles.alertTimePill}>
                        <Ionicons name="time" size={10} color="#78350F" />
                        <Text style={styles.alertTimeText}>{alertItem.time}</Text>
                      </View>
                    ) : (
                      <View style={styles.alertTimePill}>
                        <Ionicons name="sunny" size={10} color="#78350F" />
                        <Text style={styles.alertTimeText}>Tüm Gün</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.alertTitleText} numberOfLines={2}>
                    {alertItem.title}
                  </Text>
                  {alertItem.description ? (
                    <Text style={styles.alertDescText} numberOfLines={1}>
                      {alertItem.description}
                    </Text>
                  ) : null}
                </View>
              </View>

              <TouchableOpacity
                style={styles.alertQuickCheckBtn}
                onPress={async () => {
                  await toggleAgendaItemCompleted(alertItem.id, true);
                  await loadAgendaData();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark" size={15} color="#047857" />
                <Text style={styles.alertQuickCheckText}>Tamamla</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ACTIVE / NAVIGATED LESSON HERO CARD */}
      <View style={styles.heroCardContainer}>
        {effectiveHeroLesson ? (
          <Card
            style={[
              styles.activeCard,
              effectiveHeroLesson.school_color && showAllSchoolsSchedule
                ? { borderLeftWidth: 4, borderLeftColor: effectiveHeroLesson.school_color }
                : null,
            ]}
            highlightBorder={isCurrentLesson ? Colors.success : isNextLesson ? Colors.primary : Colors.primaryLight}
          >
            {/* 1. ÜST ROZETLER VE MİNİK SAĞ-SOL GEZİNME OKLARI */}
            <View style={styles.activeBadgeRow}>
              <View style={styles.activeStatusWrap}>
                {isCurrentLesson ? (
                  <View style={styles.liveIndicator}>
                    <View style={styles.pulsingDot} />
                    <Text style={styles.liveText}>ŞU ANDAKİ DERS</Text>
                  </View>
                ) : isNextLesson ? (
                  <View style={styles.nextIndicator}>
                    <View style={[styles.pulsingDot, { backgroundColor: Colors.primary }]} />
                    <Text style={styles.nextText}>SIRADAKİ DERS</Text>
                  </View>
                ) : (
                  <View style={styles.otherIndicator}>
                    <Ionicons name="time-outline" size={11} color={Colors.textSecondary} />
                    <Text style={styles.otherText}>
                      {!isHeroToday ? `${heroDayName} • ` : ''}
                      {effectiveHeroLesson.slot_name || `${effectiveHeroLesson.slot_number || heroDisplayIndex + 1}. Ders`}
                    </Text>
                  </View>
                )}

                <Badge
                  label={`${effectiveHeroLesson.start_time || ''} - ${effectiveHeroLesson.end_time || ''}`}
                  status={isCurrentLesson ? 'yapildi' : isNextLesson ? 'bekliyor' : 'varsayilan'}
                  size="sm"
                />
              </View>

              {/* SAĞ TARAF: AKTİF GÜN/SAAT BUTONU VE SAĞ-SOL GEZİNME OKLARI */}
              <View style={styles.heroRightControlsRow}>
                {/* Kaydırma oklarının solunda minik buton: Aktif gün ve ders saatine otomatik gelir */}
                <TouchableOpacity
                  style={[
                    styles.heroCurrentJumpBtn,
                    isCurrentLesson && !heroNavTarget ? styles.heroCurrentJumpBtnActive : null,
                  ]}
                  onPress={handleJumpToCurrentDayAndLesson}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="locate"
                    size={12}
                    color={isCurrentLesson && !heroNavTarget ? Colors.success : Colors.primary}
                  />
                  <Text
                    style={[
                      styles.heroCurrentJumpBtnText,
                      isCurrentLesson && !heroNavTarget ? { color: Colors.successDark } : null,
                    ]}
                  >
                    Şu An
                  </Text>
                </TouchableOpacity>

                {/* SAĞ-SOL GEZİNME OKLARI (MİNİK SAĞ SOL OKLARI) */}
                <View style={styles.heroNavContainer}>
                  <TouchableOpacity
                    style={styles.heroNavArrowBtn}
                    onPress={handlePrevHeroLesson}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={14}
                      color={Colors.primary}
                    />
                  </TouchableOpacity>

                  <Text style={styles.heroNavCounter}>
                    {heroDisplayIndex + 1}/{heroDisplayTotal || 1}
                  </Text>

                  <TouchableOpacity
                    style={styles.heroNavArrowBtn}
                    onPress={handleNextHeroLesson}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={Colors.primary}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* 2. SINIF BİLGİSİ, DERS ADI VE DERS NUMARASI - AYNI SATIRDA */}
            <View style={styles.heroCompactRow}>
              {/* Sınıf Bilgisi */}
              <View
                style={[
                  styles.heroClassBadge,
                  effectiveHeroLesson.school_color
                    ? { backgroundColor: `${effectiveHeroLesson.school_color}18` }
                    : null,
                ]}
              >
                <Ionicons
                  name="school-outline"
                  size={13}
                  color={effectiveHeroLesson.school_color || Colors.primary}
                />
                <Text
                  style={[
                    styles.heroClassBadgeText,
                    effectiveHeroLesson.school_color
                      ? { color: effectiveHeroLesson.school_color }
                      : null,
                  ]}
                >
                  {effectiveHeroLesson.class_name || 'Şube Yok'}
                </Text>
              </View>

              {/* Ders Adı */}
              <Text style={styles.heroCourseNameText} numberOfLines={1}>
                {effectiveHeroLesson.course_code ? `[${effectiveHeroLesson.course_code}] ` : ''}
                {effectiveHeroLesson.course_name || 'Ders Belirtilmemiş'}
              </Text>

              {/* Ayırıcı Nokta */}
              <Text style={styles.heroDotSeparator}>•</Text>

              {/* Ders Numarası */}
              <View style={styles.heroSlotBadge}>
                <Text style={styles.heroSlotBadgeText}>
                  {effectiveHeroLesson.slot_name || `${effectiveHeroLesson.slot_number || heroDisplayIndex + 1}. Ders`}
                </Text>
              </View>

              {/* Derslik (varsa) */}
              {effectiveHeroLesson.classroom ? (
                <>
                  <Text style={styles.heroDotSeparator}>•</Text>
                  <Text style={styles.heroClassroomText}>
                    {effectiveHeroLesson.classroom}
                  </Text>
                </>
              ) : null}
            </View>

            {/* 3. KONUNUN YAZILDIĞI KART (BÜYÜTÜLMÜŞ, TAM VE FERAH METİN) */}
            <View style={styles.expandedTopicCard}>
              <View style={styles.expandedTopicHeader}>
                <View style={styles.topicHeaderTitleRow}>
                  <View style={styles.topicBookIconBg}>
                    <Ionicons name="book-outline" size={13} color={Colors.primary} />
                  </View>
                  <Text style={styles.expandedTopicLabel}>Deftere Yazılacak Konu</Text>
                </View>

                {heroTopic && (
                  <View style={styles.topicHeaderBadges}>
                    {heroTopic.week_number ? (
                      <View style={styles.topicWeekBadge}>
                        <Text style={styles.topicWeekBadgeText}>
                          {heroTopic.week_number}. Hafta{heroTopic.lesson_hours ? ` (${heroTopic.lesson_hours}s)` : ''}
                        </Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => handleCopyNotebookText(heroTopic.subject_topic)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.topicCopyIconBtn}
                    >
                      <Ionicons name="copy-outline" size={13} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {heroTopicLoading ? (
                <View style={styles.topicLoadingContainer}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.topicLoadingText}>Konu yükleniyor...</Text>
                </View>
              ) : heroTopic ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => handleOpenTopicModal(effectiveHeroLesson)}
                >
                  <Text style={styles.expandedTopicText} selectable={true}>
                    {heroTopic.subject_topic}
                  </Text>
                  {heroTopic.learning_outcomes ? (
                    <Text style={styles.expandedOutcomeText} selectable={true} numberOfLines={2}>
                      Kazanım: {heroTopic.learning_outcomes}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.topicEmptyContainer}
                  onPress={() => handleOpenYearlyPlanModal(effectiveHeroLesson)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
                  <Text style={styles.topicEmptyText}>
                    Bu hafta için plan konusu bulunamadı. Planı açmak için dokunun.
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 4. AKSİYON BUTONLARI */}
            <View style={styles.cardActionsRow}>
              <TouchableOpacity
                style={styles.cardActionBtn}
                onPress={() => {
                  if (effectiveHeroLesson?.class_id) {
                    navigation.navigate('ClassDetail', {
                      classId: effectiveHeroLesson.class_id,
                      className: effectiveHeroLesson.class_name,
                    });
                  }
                }}
              >
                <Ionicons name="people-outline" size={16} color={Colors.primary} />
                <Text style={styles.cardActionText}>Öğrenci Listesi</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.cardActionBtn, { backgroundColor: Colors.warningLight }]}
                onPress={() => {
                  navigation.navigate('StudentNotesTab', {
                    initialClassId: effectiveHeroLesson?.class_id,
                  });
                }}
              >
                <Ionicons name="create-outline" size={16} color={Colors.warningDark} />
                <Text style={[styles.cardActionText, { color: Colors.warningDark }]}>
                  Görüş Ekle
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        ) : (
          <Card style={styles.idleCard} highlightBorder={Colors.primaryLight}>
            {/* Üst Rozetler ve Sağ Gezinme Butonları */}
            <View style={styles.activeBadgeRow}>
              <View style={styles.activeStatusWrap}>
                <View style={styles.idleIndicator}>
                  <Ionicons name="cafe" size={11} color={Colors.secondary} />
                  <Text style={styles.idleIndicatorText}>ŞU AN DERS BOŞ</Text>
                </View>
                <Badge
                  label={currentTime}
                  status="varsayilan"
                  size="sm"
                />
              </View>

              <View style={styles.heroRightControlsRow}>
                {/* Şu An Butonu - Boş ders modunda aktif yeşil */}
                <TouchableOpacity
                  style={[styles.heroCurrentJumpBtn, styles.heroCurrentJumpBtnActive]}
                  onPress={handleJumpToCurrentDayAndLesson}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="locate" size={12} color={Colors.success} />
                  <Text style={[styles.heroCurrentJumpBtnText, { color: Colors.successDark }]}>
                    Şu An
                  </Text>
                </TouchableOpacity>

                {/* SAĞ-SOL GEZİNME OKLARI */}
                <View style={styles.heroNavContainer}>
                  <TouchableOpacity
                    style={styles.heroNavArrowBtn}
                    onPress={handlePrevHeroLesson}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="chevron-back" size={14} color={Colors.primary} />
                  </TouchableOpacity>

                  <Text style={styles.heroNavCounter}>—</Text>

                  <TouchableOpacity
                    style={styles.heroNavArrowBtn}
                    onPress={handleNextHeroLesson}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* İçerik Satırı */}
            <View style={styles.idleRow}>
              <View style={styles.idleIconWrap}>
                <Ionicons name="cafe-outline" size={24} color={Colors.secondary} />
              </View>
              <View style={styles.idleTextWrap}>
                <Text style={styles.idleTitle}>Şu An Boş Ders</Text>
                <Text style={styles.idleSub} numberOfLines={2}>
                  {lessonInfo.nextLesson
                    ? `Sıradaki: ${lessonInfo.nextLesson.start_time} • ${lessonInfo.nextLesson.class_name || 'Şube'} - ${lessonInfo.nextLesson.course_name || 'Ders'}`
                    : 'Bugün için başka planlanmış ders bulunmuyor. Oklara basarak en yakın derslere göz atabilirsiniz.'}
                </Text>
              </View>
            </View>
          </Card>
        )}
      </View>

      {/* SCHEDULE SECTION WITH DAY NAVIGATOR (PREV / NEXT ARROWS) */}
      <View style={styles.scheduleHeaderRow}>
        <View style={styles.dayNavigator}>
          <TouchableOpacity
            style={styles.navArrowBtn}
            onPress={handlePrevDay}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={18} color={Colors.primary} />
          </TouchableOpacity>

          <View style={styles.dayTitleContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.dayMainTitle}>
                {isViewingToday ? 'Bugün' : `${selectedDayObj?.name} `}
              </Text>
              {isViewingToday ? (
                <View style={styles.todayPill}>
                  <Text style={styles.todayPillText}>Bugün</Text>
                </View>
              ) : (
                <TouchableOpacity onPress={handleJumpToToday} style={styles.returnTodayBtn}>
                  <Ionicons name="return-down-back" size={11} color={Colors.primary} />
                  <Text style={styles.returnTodayBtnText}>Bugün</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.daySubTitle}>
              {isViewingToday ? `${selectedDayObj?.name} Programı` : `${selectedDayObj?.name} Günü Programı`}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.navArrowBtn}
            onPress={handleNextDay}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('ScheduleTab')}>
          <Text style={styles.seeAllText}>Tüm Program</Text>
        </TouchableOpacity>
      </View>

      {/* TÜM PROGRAMLARI GÖSTER SWITCH ROW */}
      <View style={styles.allProgramsSwitchRow}>
        <View style={styles.allProgramsSwitchLeft}>
          <Ionicons
            name={showAllSchoolsSchedule ? 'layers' : 'layers-outline'}
            size={16}
            color={showAllSchoolsSchedule ? (activeSchool?.color || Colors.primary) : Colors.textSecondary}
          />
          <Text style={styles.allProgramsSwitchLabel}>Tüm programları göster</Text>
          {showAllSchoolsSchedule && schoolsList.length > 1 && (
            <View
              style={[
                styles.schoolsCountBadge,
                { backgroundColor: (activeSchool?.color || Colors.primary) + '18' },
              ]}
            >
              <Text
                style={[
                  styles.schoolsCountBadgeText,
                  { color: activeSchool?.color || Colors.primary },
                ]}
              >
                {schoolsList.length} Okul
              </Text>
            </View>
          )}
        </View>

        <Switch
          value={showAllSchoolsSchedule}
          onValueChange={handleToggleShowAllSchools}
          trackColor={{
            false: '#E2E8F0',
            true: (activeSchool?.color || Colors.primary) + '50',
          }}
          thumbColor={showAllSchoolsSchedule ? (activeSchool?.color || Colors.primary) : '#FFFFFF'}
          style={Platform.OS === 'ios' ? { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] } : undefined}
        />
      </View>

      {displayedLessons.length === 0 ? (
        <Card style={styles.emptyTodayCard}>
          <Ionicons name="calendar-outline" size={32} color={Colors.textMuted} />
          <Text style={styles.emptyTodayText}>
            {selectedDayObj?.name} günü için planlanmış ders bulunmuyor.
          </Text>
          <TouchableOpacity
            style={styles.addScheduleLink}
            onPress={() => navigation.navigate('ScheduleTab')}
          >
            <Text style={styles.addScheduleLinkText}>Programı Düzenle</Text>
          </TouchableOpacity>
        </Card>
      ) : (
        displayedLessons.map((item, index) => {
          const isCurrent =
            isViewingToday &&
            lessonInfo.currentLesson &&
            lessonInfo.currentLesson.slot_id === item.slot_id;

          const schoolColor = item.school_color || activeSchool?.color || Colors.primary;

          // Arkaplan rengi: Tüm programlar gösteriliyorsa ilgili okulun rengiyle hafif tonlu
          const cardBg = showAllSchoolsSchedule && item.school_color
            ? `${item.school_color}14`
            : isCurrent
            ? '#F8FAFC'
            : Colors.card;

          const cardBorder = isCurrent
            ? Colors.primary
            : showAllSchoolsSchedule && item.school_color
            ? `${item.school_color}40`
            : undefined;

          return (
            <Card
              key={`${item.slot_id}-${item.id || index}`}
              style={[
                styles.timelineCard,
                { backgroundColor: cardBg },
                showAllSchoolsSchedule && item.school_color
                  ? { borderLeftWidth: 4, borderLeftColor: item.school_color }
                  : isCurrent
                  ? styles.timelineActive
                  : null,
              ]}
              highlightBorder={cardBorder}
            >
              <View style={styles.timelineRow}>
                {/* 1. DERS NUMARASI / SAATİ (Dokununca deftere yazılacak metin popup'ı) */}
                <TouchableOpacity
                  style={styles.timeColumnTouch}
                  onPress={() => handleOpenTopicModal(item)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.slotName}>{item.slot_name}</Text>
                  <Text style={styles.timeRange}>
                    {item.start_time} - {item.end_time}
                  </Text>
                  <View
                    style={[
                      styles.defterPill,
                      showAllSchoolsSchedule && item.school_color
                        ? { backgroundColor: `${item.school_color}18` }
                        : null,
                    ]}
                  >
                    <Ionicons
                      name="create-outline"
                      size={11}
                      color={showAllSchoolsSchedule && item.school_color ? item.school_color : Colors.primary}
                    />
                    <Text
                      style={[
                        styles.defterPillText,
                        showAllSchoolsSchedule && item.school_color ? { color: item.school_color } : null,
                      ]}
                    >
                      Defter
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.lessonDivider} />

                {/* 2. ORTA BÖLÜM: OKUL ROZETİ, ÇAKIŞMA UYARISI, ŞUBE ADI & DERS */}
                <View style={styles.lessonContent}>
                  {showAllSchoolsSchedule && (
                    <View style={styles.cardMetaRow}>
                      {item.school_name && (
                        <View
                          style={[
                            styles.schoolPill,
                            {
                              backgroundColor: `${schoolColor}18`,
                              borderColor: `${schoolColor}35`,
                            },
                          ]}
                        >
                          <View style={[styles.schoolPillDot, { backgroundColor: schoolColor }]} />
                          <Text
                            style={[styles.schoolPillText, { color: schoolColor }]}
                            numberOfLines={1}
                          >
                            {item.school_name}
                          </Text>
                        </View>
                      )}

                      {item.has_conflict && (
                        <TouchableOpacity
                          style={styles.conflictWarningBadge}
                          onPress={() => {
                            Alert.alert(
                              'Ders Saati Çakışması',
                              `Bu saatte başka bir okulda da dersiniz bulunmaktadır:\n\n` +
                              `• Görüntülenen: ${item.school_name || 'Seçili Okul'} - ${item.class_name || ''} (${item.course_name || ''})\n` +
                              `• Çakışan Okul: ${item.conflict_school_name || 'Diğer Okul'}\n` +
                              `• Çakışan Şube: ${item.conflict_class_name || '-'}\n` +
                              `• Çakışan Ders: ${item.conflict_course_name || '-'}\n` +
                              `• Saat: ${item.conflict_time || item.start_time || ''}`,
                              [{ text: 'Tamam' }]
                            );
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="warning" size={12} color="#D97706" />
                          <Text style={styles.conflictWarningText} numberOfLines={1}>
                            Çakışma: {item.conflict_school_name}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  <View style={styles.lessonHeaderRow}>
                    <TouchableOpacity
                      onPress={() => {
                        if (item.class_id) {
                          navigation.navigate('ClassDetail', {
                            classId: item.class_id,
                            className: item.class_name,
                          });
                        }
                      }}
                      activeOpacity={0.7}
                      style={styles.classNameTouch}
                    >
                      <Text style={styles.lessonClass}>{item.class_name || '-'}</Text>
                      <Ionicons
                        name="people-circle-outline"
                        size={16}
                        color={showAllSchoolsSchedule && item.school_color ? item.school_color : Colors.primary}
                      />
                    </TouchableOpacity>

                    {isCurrent && (
                      <Badge label="Ders İşleniyor" status="yapildi" size="sm" />
                    )}
                  </View>
                  <Text style={styles.lessonCourse}>
                    {item.course_code ? `[${item.course_code}] ` : ''}
                    {item.course_name || '-'}
                  </Text>
                  {item.classroom && (
                    <Text style={styles.classroomSmall}>Derslik: {item.classroom}</Text>
                  )}
                </View>

                {/* 3. EN SAĞ TARAF: O SINIF DÜZEYİNE AİT YILLIK PLAN POPUP BUTONU */}
                <TouchableOpacity
                  style={styles.planCardBtn}
                  onPress={() => handleOpenYearlyPlanModal(item)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.planBtnIconWrap,
                      showAllSchoolsSchedule && item.school_color
                        ? { backgroundColor: `${item.school_color}18` }
                        : null,
                    ]}
                  >
                    <Ionicons
                      name="book-outline"
                      size={15}
                      color={showAllSchoolsSchedule && item.school_color ? item.school_color : Colors.primary}
                    />
                  </View>
                  <Text
                    style={[
                      styles.planCardBtnText,
                      showAllSchoolsSchedule && item.school_color ? { color: item.school_color } : null,
                    ]}
                  >
                    Plan
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
          );
        })
      )}

      {/* 📅 AJANDA & YAPILACAKLAR BÖLÜMÜ (SEÇİLİ GÜNE ENTEGRE) */}
      <View style={styles.todayAgendaSection}>
        <View style={styles.todayAgendaHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <View
              style={[
                styles.agendaSectionIconWrap,
                { backgroundColor: `${activeSchool?.color || Colors.primary}18` },
              ]}
            >
              <Ionicons name="calendar" size={17} color={activeSchool?.color || Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={styles.todayAgendaTitle}>
                  {isViewingToday ? 'Bugünün Ajandası' : `${selectedDayObj?.name} Günü Ajandası`}
                </Text>
                <View style={styles.agendaDateBadge}>
                  <Text style={styles.agendaDateBadgeText}>
                    {formatDateShortTR(selectedDateString)}
                  </Text>
                </View>
                {selectedDayAgendaItems.length > 0 && (
                  <View style={[styles.agendaCountBadge, { backgroundColor: `${activeSchool?.color || Colors.primary}18` }]}>
                    <Text style={[styles.agendaCountBadgeText, { color: activeSchool?.color || Colors.primary }]}>
                      {selectedDayAgendaItems.filter((i) => i.is_completed === 1).length}/{selectedDayAgendaItems.length}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.todayAgendaSubtitle}>
                {selectedDayAgendaItems.length > 0
                  ? `${selectedDayAgendaItems.filter((i) => i.is_completed === 0).length} bekleyen iş / randevu`
                  : isViewingToday
                  ? 'Günün planları, görevleri ve hatırlatıcıları'
                  : `${selectedDayObj?.name} için kayıtlı randevu veya görev bulunmuyor`}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              style={[styles.agendaQuickAddBtn, { borderColor: activeSchool?.color || Colors.primary }]}
              onPress={() => navigation.navigate('Agenda', { initialDate: selectedDateString })}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={14} color={activeSchool?.color || Colors.primary} />
              <Text style={[styles.agendaQuickAddText, { color: activeSchool?.color || Colors.primary }]}>Ekle</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.agendaViewAllBtn}
              onPress={() => navigation.navigate('Agenda', { initialDate: selectedDateString })}
              activeOpacity={0.7}
            >
              <Text style={styles.agendaViewAllText}>Tümü</Text>
              <Ionicons name="chevron-forward" size={13} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {selectedDayAgendaItems.length === 0 ? (
          <TouchableOpacity
            style={styles.agendaEmptyBanner}
            onPress={() => navigation.navigate('Agenda', { initialDate: selectedDateString })}
            activeOpacity={0.7}
          >
            <View style={styles.agendaEmptyIconWrap}>
              <Ionicons name="sparkles" size={18} color={activeSchool?.color || Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.agendaEmptyTitle}>
                {isViewingToday
                  ? 'Bugün için kayıtlı işiniz yok'
                  : `${selectedDayObj?.name} (${formatDateShortTR(selectedDateString)}) için kayıtlı randevu veya iş yok`}
              </Text>
              <Text style={styles.agendaEmptyText}>
                {isViewingToday
                  ? 'Günün görevlerini veya hatırlatıcılarını eklemek için dokunun.'
                  : `${selectedDayObj?.name} gününe görev veya randevu eklemek için dokunun.`}
              </Text>
            </View>
            <Ionicons name="add-circle" size={20} color={activeSchool?.color || Colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.agendaItemsList}>
            {selectedDayAgendaItems.map((item) => {
              const isCompleted = item.is_completed === 1;
              return (
                <View
                  key={item.id}
                  style={[
                    styles.agendaItemRow,
                    item.is_all_day_alert === 1 && !isCompleted ? styles.agendaItemRowAlert : null,
                    isCompleted ? styles.agendaItemRowCompleted : null,
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.agendaCheckbox,
                      isCompleted ? styles.agendaCheckboxDone : styles.agendaCheckboxPending,
                    ]}
                    onPress={async () => {
                      await toggleAgendaItemCompleted(item.id, !isCompleted);
                      await loadAgendaData(selectedDateString);
                    }}
                    activeOpacity={0.7}
                  >
                    {isCompleted && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => navigation.navigate('Agenda', { initialDate: selectedDateString })}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text
                        style={[
                          styles.agendaItemTitle,
                          isCompleted ? styles.agendaItemTitleDone : null,
                        ]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      {item.is_all_day_alert === 1 && !isCompleted && (
                        <View style={styles.agendaMiniAlertPill}>
                          <Ionicons name="alert-circle" size={10} color={Colors.danger} />
                          <Text style={styles.agendaMiniAlertText}>Uyarı</Text>
                        </View>
                      )}
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      {item.has_time === 1 && item.time ? (
                        <View style={styles.agendaTimeMini}>
                          <Ionicons name="time-outline" size={10} color={Colors.textSecondary} />
                          <Text style={styles.agendaTimeMiniText}>{item.time}</Text>
                        </View>
                      ) : (
                        <View style={styles.agendaTimeMini}>
                          <Ionicons name="sunny-outline" size={10} color={Colors.textMuted} />
                          <Text style={styles.agendaTimeMiniText}>Tüm Gün</Text>
                        </View>
                      )}

                      <Text style={styles.agendaCategoryMiniText}>
                        {item.category === 'gorev' ? '📝 Görev' :
                         item.category === 'toplanti' ? '👥 Toplantı' :
                         item.category === 'sinav' ? '📋 Sınav / Not' :
                         item.category === 'nobet' ? '🛡️ Nöbet' :
                         item.category === 'hatirlatma' ? '🔔 Hatırlatma' : '📌 Diğer'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* QUICK ACTION BUTTONS */}
      <Text style={styles.sectionHeader}>Hızlı İşlemler</Text>
      <View style={styles.quickGrid}>
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => navigation.navigate('AssignmentCreate')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: Colors.primaryLight }]}>
              <Ionicons name="document-text" size={22} color={Colors.primary} />
            </View>
            <View style={styles.quickTextWrap}>
              <Text style={styles.quickTitle}>Yeni Ödev Ver</Text>
              <Text style={styles.quickSub}>Şube & Muafiyet</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => navigation.navigate('StudentNotesTab')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: Colors.warningLight }]}>
              <Ionicons name="chatbubbles" size={22} color={Colors.warningDark} />
            </View>
            <View style={styles.quickTextWrap}>
              <Text style={styles.quickTitle}>Öğrenci Görüşü</Text>
              <Text style={styles.quickSub}>Not & Değerlendirme</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => navigation.navigate('ScheduleTab')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: Colors.secondaryLight }]}>
              <Ionicons name="calendar" size={22} color={Colors.secondary} />
            </View>
            <View style={styles.quickTextWrap}>
              <Text style={styles.quickTitle}>Ders Programı</Text>
              <Text style={styles.quickSub}>Saat & Şubeler</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => navigation.navigate('ReportsTab')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: Colors.successLight }]}>
              <Ionicons name="stats-chart" size={22} color={Colors.successDark} />
            </View>
            <View style={styles.quickTextWrap}>
              <Text style={styles.quickTitle}>Excel Raporları</Text>
              <Text style={styles.quickSub}>Dışa Aktar & Paylaş</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => navigation.navigate('YearlyPlan')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: '#EDE9FE' }]}>
              <Ionicons name="book" size={22} color="#7C3AED" />
            </View>
            <View style={styles.quickTextWrap}>
              <Text style={styles.quickTitle}>Yıllık Plan</Text>
              <Text style={styles.quickSub}>Müfredat & Konular</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => navigation.navigate('Operations')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="construct" size={22} color="#DC2626" />
            </View>
            <View style={styles.quickTextWrap}>
              <Text style={styles.quickTitle}>İşlemler</Text>
              <Text style={styles.quickSub}>Yedekleme & Ayarlar</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => navigation.navigate('Agenda')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: '#E0F2FE' }]}>
              <Ionicons name="calendar" size={22} color="#0284C7" />
            </View>
            <View style={styles.quickTextWrap}>
              <Text style={styles.quickTitle}>Ajanda & Hatırlatıcı</Text>
              <Text style={styles.quickSub}>Görevler & Uyarılar</Text>
            </View>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />
        </View>

        {/* CANLI SAAT VE ZAMAN KARTI */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: Colors.card,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: Colors.border,
          marginTop: 4,
          ...Shadows.small,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: activeSchool?.color ? `${activeSchool.color}15` : Colors.primaryLight,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="time" size={20} color={activeSchool?.color || Colors.primary} />
            </View>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase' }}>
                Canlı Zaman & Sistem Saati
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textPrimary }}>
                {todayName}, {formatDateToTR(new Date().toISOString().split('T')[0])}
              </Text>
            </View>
          </View>

          <View style={{
            backgroundColor: activeSchool?.color || Colors.primary,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 20,
          }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 }}>
              {currentTime}
            </Text>
          </View>
        </View>
      </View>

      {/* QUICK STATS (AT THE BOTTOM OF PAGE) */}
      <Text style={styles.sectionHeader}>Genel İstatistikler</Text>
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.classCount}</Text>
          <Text style={styles.statLabel}>Şube</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.studentCount}</Text>
          <Text style={styles.statLabel}>Öğrenci</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{lessonInfo.todayLessons.length}</Text>
          <Text style={styles.statLabel}>Bugünkü Ders</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: Colors.warning }]}>
            {stats.pendingAssignments}
          </Text>
          <Text style={styles.statLabel}>Bekleyen Ödev</Text>
        </View>
      </View>
    </ScrollView>

      {/* 1. DEFTERE YAZILACAK METİN (KONU) POP-UP MODAL */}
      <Modal
        visible={topicModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setTopicModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            {/* Modal Başlığı */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.modalClassTag}>
                    {topicInfo?.className || '-'}
                  </Text>
                  <Text style={styles.modalCourseTag}>
                    {topicInfo?.courseName || '-'}
                  </Text>
                </View>
                <Text style={styles.modalTitle}>Deftere Yazılacak Metin</Text>
              </View>
              <TouchableOpacity
                onPress={() => setTopicModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {topicLoading ? (
              <View style={styles.modalLoadingWrap}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.modalLoadingText}>Konu ve plan yükleniyor...</Text>
              </View>
            ) : !topicInfo || !topicInfo.found || topicInfo.allTopics.length === 0 ? (
              <View style={styles.modalEmptyWrap}>
                <Ionicons name="book-outline" size={44} color={Colors.textMuted} />
                <Text style={styles.modalEmptyTitle}>Yıllık Plan Bulunamadı</Text>
                <Text style={styles.modalEmptyDesc}>
                  Bu ders ve sınıf düzeyi için sisteme henüz yıllık plan yüklenmemiş.
                </Text>
                <TouchableOpacity
                  style={styles.modalEmptyBtn}
                  onPress={() => {
                    setTopicModalVisible(false);
                    navigation.navigate('YearlyPlan');
                  }}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.modalEmptyBtnText}>Yıllık Plan Yükle / Düzenle</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={{ paddingBottom: 24 }}
                showsVerticalScrollIndicator={false}
              >
                {/* Gezinme Şeridi */}
                <View style={styles.topicStepperRow}>
                  <TouchableOpacity
                    style={[
                      styles.stepArrowBtn,
                      selectedTopicIndex <= 0 && styles.stepArrowBtnDisabled,
                    ]}
                    disabled={selectedTopicIndex <= 0}
                    onPress={() => setSelectedTopicIndex((prev) => Math.max(0, prev - 1))}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={18}
                      color={selectedTopicIndex <= 0 ? Colors.textMuted : Colors.primary}
                    />
                    <Text
                      style={[
                        styles.stepArrowText,
                        selectedTopicIndex <= 0 && { color: Colors.textMuted },
                      ]}
                    >
                      Önceki
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.stepCounterText}>
                    Ders Sırası: {selectedTopicIndex + 1} / {topicInfo.allTopics.length}
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.stepArrowBtn,
                      selectedTopicIndex >= topicInfo.allTopics.length - 1 &&
                        styles.stepArrowBtnDisabled,
                    ]}
                    disabled={selectedTopicIndex >= topicInfo.allTopics.length - 1}
                    onPress={() =>
                      setSelectedTopicIndex((prev) =>
                        Math.min(topicInfo.allTopics.length - 1, prev + 1)
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.stepArrowText,
                        selectedTopicIndex >= topicInfo.allTopics.length - 1 && {
                          color: Colors.textMuted,
                        },
                      ]}
                    >
                      Sonraki
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={
                        selectedTopicIndex >= topicInfo.allTopics.length - 1
                          ? Colors.textMuted
                          : Colors.primary
                      }
                    />
                  </TouchableOpacity>
                </View>

                {/* 1. SON İKİ DERS (ÖNCEKİ 2 DERSİN METNİ) */}
                <Text style={styles.topicSectionHeader}>Son İki Dersin Metni</Text>
                {prevTopics.length === 0 ? (
                  <View style={styles.noAdjacentBox}>
                    <Text style={styles.noAdjacentText}>
                      Önceki ders kaydı bulunmuyor (Dönem başlangıcı).
                    </Text>
                  </View>
                ) : (
                  prevTopics.map(({ offset, item }) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.adjacentCard}
                      onPress={() => {
                        const targetIdx = topicInfo.allTopics.findIndex((t) => t.id === item.id);
                        if (targetIdx >= 0) setSelectedTopicIndex(targetIdx);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.adjacentHeaderRow}>
                        <View style={styles.offsetBadgeGray}>
                          <Ionicons name="time-outline" size={12} color={Colors.textSecondary} />
                          <Text style={styles.offsetBadgeTextGray}>
                            {offset === -2 ? '2 Ders Önce' : '1 Ders Önce'}
                          </Text>
                        </View>
                        <Text style={styles.adjacentMetaText}>
                          {item.week_number}. Hafta {item.lesson_hours ? `(${item.lesson_hours} Saat)` : ''}
                        </Text>
                      </View>
                      <Text style={styles.adjacentTopicText} numberOfLines={3} selectable={true}>
                        {item.subject_topic}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}

                {/* 2. O DERS: DEFTERE YAZILACAK METİN (Vurgulu & Büyütülmüş & Kopyalanabilir) */}
                {currentTopicItem && (
                  <View style={styles.currentTopicHeroCard}>
                    <View style={styles.heroBadgeRow}>
                      <View style={styles.mainBadge}>
                        <Ionicons name="star" size={14} color="#FFFFFF" />
                        <Text style={styles.mainBadgeText}>BU DERSTE DEFTERE YAZILACAK</Text>
                      </View>
                      <Text style={styles.heroWeekText}>
                        {currentTopicItem.week_number}. Hafta
                      </Text>
                    </View>

                    {currentTopicItem.date_start && currentTopicItem.date_end && (
                      <Text style={styles.heroDateText}>
                        Tarih: {formatDateToTR(currentTopicItem.date_start)} - {formatDateToTR(currentTopicItem.date_end)}
                      </Text>
                    )}

                    <View style={styles.heroTopicBox}>
                      <Text style={styles.heroTopicText} selectable={true}>
                        {currentTopicItem.subject_topic}
                      </Text>
                    </View>

                    {currentTopicItem.learning_outcomes ? (
                      <View style={styles.outcomesContainer}>
                        <Text style={styles.outcomesLabel}>Kazanımlar / Açıklama:</Text>
                        <Text style={styles.outcomesBody} selectable={true}>
                          {currentTopicItem.learning_outcomes}
                        </Text>
                      </View>
                    ) : null}

                    {/* Defter Metnini Kopyala Butonu */}
                    <TouchableOpacity
                      style={styles.heroCopyBtn}
                      onPress={() => handleCopyNotebookText(currentTopicItem.subject_topic)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="copy" size={18} color="#FFFFFF" />
                      <Text style={styles.heroCopyBtnText}>Defter Metnini Kopyala</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 3. GELECEK İKİ DERS (SONRAKİ 2 DERSİN METNİ) */}
                <Text style={styles.topicSectionHeader}>Gelecek İki Dersin Metni</Text>
                {nextTopics.length === 0 ? (
                  <View style={styles.noAdjacentBox}>
                    <Text style={styles.noAdjacentText}>
                      Sonraki ders kaydı bulunmuyor (Dönem sonu).
                    </Text>
                  </View>
                ) : (
                  nextTopics.map(({ offset, item }) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.adjacentCard}
                      onPress={() => {
                        const targetIdx = topicInfo.allTopics.findIndex((t) => t.id === item.id);
                        if (targetIdx >= 0) setSelectedTopicIndex(targetIdx);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.adjacentHeaderRow}>
                        <View style={styles.offsetBadgeBlue}>
                          <Ionicons name="arrow-forward-circle-outline" size={12} color="#0284C7" />
                          <Text style={styles.offsetBadgeTextBlue}>
                            {offset === 1 ? '1 Ders Sonra' : '2 Ders Sonra'}
                          </Text>
                        </View>
                        <Text style={styles.adjacentMetaText}>
                          {item.week_number}. Hafta {item.lesson_hours ? `(${item.lesson_hours} Saat)` : ''}
                        </Text>
                      </View>
                      <Text style={styles.adjacentTopicText} numberOfLines={3} selectable={true}>
                        {item.subject_topic}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* 2. O SINIF DÜZEYİNE AİT YILLIK PLAN POP-UP MODAL */}
      <Modal
        visible={yearlyPlanModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setYearlyPlanModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContainer, styles.yearlyPlanModalContainer]}>
            {/* Modal Başlığı */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.modalClassTag}>
                    {yearlyPlanMeta?.gradeLevel ? `${yearlyPlanMeta.gradeLevel}. Sınıf` : 'Sınıf'}
                  </Text>
                  <Text style={styles.modalCourseTag}>
                    {yearlyPlanMeta?.courseName || '-'}
                  </Text>
                </View>
                <Text style={styles.modalTitle}>
                  {yearlyPlanMeta?.className ? `${yearlyPlanMeta.className} Yıllık Müfredat Planı` : 'Yıllık Plan'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  onPress={handleScrollToTodayPlan}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.headerTodayIconBtn}
                  accessibilityLabel="Bugünün Kazanımına Git"
                >
                  <Ionicons name="locate-outline" size={17} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setYearlyPlanModalVisible(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.modalCloseBtn}
                >
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Üst İşlem Butonları */}
            <View style={styles.yearlyPlanActionsRow}>
              {yearlyPlanPdf && (
                <>
                  <TouchableOpacity
                    style={styles.pdfOpenBtn}
                    onPress={() => setPdfViewerModalVisible(true)}
                  >
                    <Ionicons name="document-text" size={14} color="#FFFFFF" />
                    <Text style={styles.pdfOpenBtnText}>PDF Gör</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pdfOpenBtn, { backgroundColor: Colors.secondary }]}
                    onPress={() =>
                      viewYearlyPlanPdf(
                        yearlyPlanPdf.file_uri,
                        `${yearlyPlanMeta?.gradeLevel}. Sınıf ${yearlyPlanMeta?.courseName} Yıllık Planı`
                      )
                    }
                  >
                    <Ionicons name="share-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.pdfOpenBtnText}>PDF Paylaş/Aç</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                style={styles.planManageBtn}
                onPress={() => {
                  setYearlyPlanModalVisible(false);
                  navigation.navigate('YearlyPlan');
                }}
              >
                <Ionicons name="create-outline" size={14} color={Colors.primary} />
                <Text style={styles.planManageBtnText}>Planı Yönet</Text>
              </TouchableOpacity>
            </View>

            {/* Arama ve Tarih Filtreleme Çubuğu */}
            <View style={styles.searchBarWrap}>
              <Ionicons name="search" size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Konu, hafta veya kazanım ara..."
                placeholderTextColor={Colors.textMuted}
                value={planSearchQuery}
                onChangeText={setPlanSearchQuery}
              />
              {planSearchQuery ? (
                <TouchableOpacity onPress={() => setPlanSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Tarih Aralığı Filtresi (Picker) */}
            <View style={styles.dateFilterContainer}>
              <TouchableOpacity
                style={styles.dateFilterInputBox}
                onPress={() => setShowPlanDatePicker('start')}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                <Text style={styles.dateFilterText}>
                  {planDateStart ? formatDateToTR(planDateStart) : 'Başlangıç Tarihi'}
                </Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: Colors.textMuted }}>-</Text>
              <TouchableOpacity
                style={styles.dateFilterInputBox}
                onPress={() => setShowPlanDatePicker('end')}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                <Text style={styles.dateFilterText}>
                  {planDateEnd ? formatDateToTR(planDateEnd) : 'Bitiş Tarihi'}
                </Text>
              </TouchableOpacity>
              {(planDateStart || planDateEnd) && (
                <TouchableOpacity onPress={() => { setPlanDateStart(''); setPlanDateEnd(''); }}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
              {/* Mini Icon: Bugünün / Bu Haftanın Kazanımına Git */}
              <TouchableOpacity
                style={styles.todayJumpIconBtn}
                onPress={handleScrollToTodayPlan}
                activeOpacity={0.7}
                accessibilityLabel="Bugünün Kazanımına Git"
              >
                <Ionicons name="navigate-circle" size={16} color="#FFFFFF" />
                <Text style={styles.todayJumpIconBtnText}>Bugün</Text>
              </TouchableOpacity>
            </View>

            {showPlanDatePicker && (
              <DateTimePicker
                value={
                  showPlanDatePicker === 'start'
                    ? (planDateStart && !isNaN(new Date(planDateStart).getTime()) ? new Date(planDateStart) : new Date())
                    : (planDateEnd && !isNaN(new Date(planDateEnd).getTime()) ? new Date(planDateEnd) : new Date())
                }
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, selectedDate) => {
                  const mode = showPlanDatePicker;
                  setShowPlanDatePicker(null);
                  if (selectedDate) {
                    const isoStr = selectedDate.toISOString().split('T')[0];
                    if (mode === 'start') {
                      setPlanDateStart(isoStr);
                      // Başlangıç değişirse varsayılan bitişi de 1 yıl sonrasına ayarla
                      const endDateObj = new Date(selectedDate);
                      endDateObj.setFullYear(endDateObj.getFullYear() + 1);
                      setPlanDateEnd(endDateObj.toISOString().split('T')[0]);
                    } else {
                      setPlanDateEnd(isoStr);
                    }
                  }
                }}
              />
            )}

            {yearlyPlanLoading ? (
              <View style={styles.modalLoadingWrap}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.modalLoadingText}>Yıllık plan listeleniyor...</Text>
              </View>
            ) : filteredPlanList.length === 0 ? (
              <View style={styles.modalEmptyWrap}>
                <Ionicons name="calendar-outline" size={44} color={Colors.textMuted} />
                <Text style={styles.modalEmptyTitle}>Kayıt Bulunamadı</Text>
                <Text style={styles.modalEmptyDesc}>
                  {planSearchQuery || planDateStart || planDateEnd
                    ? 'Filtrelerinize uygun plan satırı bulunamadı.'
                    : 'Bu sınıf düzeyi için henüz yıllık plan yüklenmemiş.'}
                </Text>
                {!planSearchQuery && !planDateStart && !planDateEnd && (
                  <TouchableOpacity
                    style={styles.modalEmptyBtn}
                    onPress={() => {
                      setYearlyPlanModalVisible(false);
                      navigation.navigate('YearlyPlan');
                    }}
                  >
                    <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.modalEmptyBtnText}>Plan Yükle (Excel / PDF)</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <ScrollView
                ref={planScrollRef}
                style={styles.modalScroll}
                contentContainerStyle={{ paddingBottom: 30 }}
                showsVerticalScrollIndicator={true}
              >
                {filteredPlanList.map((plan) => {
                  const todayStr = getTodayDateString();
                  const isThisWeek =
                    Boolean(plan.date_start && plan.date_end && plan.date_start <= todayStr && plan.date_end >= todayStr);
                  const isHighlighted = highlightedPlanId === plan.id;

                  return (
                    <View
                      key={plan.id}
                      onLayout={(event) => {
                        const y = event.nativeEvent.layout.y;
                        planItemOffsets.current[plan.id] = y;
                      }}
                      style={[
                        styles.planItemCard,
                        isThisWeek && styles.planItemCardActive,
                        isHighlighted && styles.planItemCardHighlighted,
                      ]}
                    >
                      {/* Hafta Numarası, Tarih Aralığı ve Bu Hafta rozeti aynı satırda */}
                      <View style={styles.planItemHeaderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                          <View
                            style={[
                              styles.weekBadge,
                              isThisWeek && { backgroundColor: Colors.primary },
                            ]}
                          >
                            <Text
                              style={[
                                styles.weekBadgeText,
                                isThisWeek && { color: '#FFFFFF' },
                              ]}
                            >
                              {plan.week_number}. Hafta
                            </Text>
                          </View>

                          {plan.date_start && plan.date_end && (
                            <Text style={styles.planDateInlineText}>
                              📅 {formatDateToTR(plan.date_start)} - {formatDateToTR(plan.date_end)}
                            </Text>
                          )}

                          {isThisWeek && (
                            <Badge label="Bu Hafta" status="yapildi" size="sm" />
                          )}
                          {!isThisWeek && isHighlighted && (
                            <Badge label="Bugüne En Yakın" status="bekliyor" size="sm" />
                          )}
                        </View>

                        <Text style={styles.planHoursText}>
                          {plan.lesson_hours ? `${plan.lesson_hours} Sa` : ''}
                        </Text>
                      </View>

                      <Text style={styles.planSubjectText} selectable={true}>
                        {plan.subject_topic}
                      </Text>

                      {plan.learning_outcomes ? (
                        <View style={styles.planOutcomesWrap}>
                          <Text style={styles.planOutcomesLabel}>Kazanım:</Text>
                          <Text style={styles.planOutcomesBody} selectable={true}>
                            {plan.learning_outcomes}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* 3. PDF GÖRÜNTÜLEME MODALI */}
      <PdfViewerModal
        visible={pdfViewerModalVisible}
        onClose={() => setPdfViewerModalVisible(false)}
        fileUri={yearlyPlanPdf?.file_uri || null}
        fileName={yearlyPlanPdf?.file_name}
        title={`${yearlyPlanMeta?.gradeLevel || ''}. Sınıf ${yearlyPlanMeta?.courseName || ''} Yıllık Planı`}
        onShareOrExternal={() => {
          if (yearlyPlanPdf) {
            viewYearlyPlanPdf(
              yearlyPlanPdf.file_uri,
              `${yearlyPlanMeta?.gradeLevel}. Sınıf ${yearlyPlanMeta?.courseName} Yıllık Planı`
            );
          }
        }}
      />

      {/* 4. OKUL DEĞİŞTİRME & EKLEME POP-UP MODALI */}
      <Modal
        visible={schoolModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSchoolModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContainer, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalClassTag}>OKUL SEÇİMİ VE YÖNETİMİ</Text>
                <Text style={styles.modalTitle}>Aktif Okulu Değiştir</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setSchoolModalVisible(false);
                  setIsAddingSchool(false);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingVertical: 10, gap: 12 }}>
              <Text style={{ fontSize: 13, color: Colors.textSecondary, lineHeight: 18 }}>
                Çalıştığınız okulu seçin veya yeni okul ekleyin. Seçtiğiniz okulun renk teması uygulamaya otomatik uygulanacaktır.
              </Text>

              {/* Okul Listesi */}
              {schoolsList.map((sch) => {
                const isActive = sch.id === activeSchool?.id;
                const isEditing = editingSchool?.id === sch.id;

                if (isEditing) {
                  return (
                    <View key={sch.id} style={{ backgroundColor: '#F8FAFC', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, gap: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textPrimary }}>
                        Okul Düzenle
                      </Text>
                      
                      <View>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 }}>
                          Okul Adı
                        </Text>
                        <TextInput
                          style={{
                            backgroundColor: '#FFFFFF',
                            borderWidth: 1,
                            borderColor: Colors.border,
                            borderRadius: 10,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            fontSize: 14,
                            color: Colors.textPrimary,
                          }}
                          value={editSchoolName}
                          onChangeText={setEditSchoolName}
                        />
                      </View>

                      <View>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 }}>
                          Renk Teması
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                          {SCHOOL_COLORS.map((c) => (
                            <TouchableOpacity
                              key={c.color}
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 16,
                                backgroundColor: c.color,
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderWidth: editSchoolColor === c.color ? 3 : 0,
                                borderColor: '#0F172A',
                              }}
                              onPress={() => setEditSchoolColor(c.color)}
                            >
                              {editSchoolColor === c.color && (
                                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                        <TouchableOpacity
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.cardSubtle, alignItems: 'center' }}
                          onPress={() => setEditingSchool(null)}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textSecondary }}>Vazgeç</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: editSchoolColor, alignItems: 'center' }}
                          onPress={handleSaveEditSchool}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Kaydet</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }

                return (
                  <View
                    key={sch.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 14,
                      backgroundColor: isActive ? '#F0FDF4' : Colors.cardSubtle,
                      borderWidth: 2,
                      borderColor: isActive ? sch.color : 'transparent',
                      gap: 10,
                    }}
                  >
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                      onPress={() => handleSelectSchool(sch.id)}
                      activeOpacity={0.8}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: sch.color,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="school" size={18} color="#FFFFFF" />
                      </View>

                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.textPrimary }} numberOfLines={1}>
                            {sch.name}
                          </Text>
                          {isActive && (
                            <View style={{ backgroundColor: sch.color, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>Aktif</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Action buttons (Edit & Delete) */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TouchableOpacity
                        style={{ padding: 6, borderRadius: 8, backgroundColor: '#E2E8F0' }}
                        onPress={() => handleStartEditSchool(sch)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="pencil" size={15} color={Colors.textSecondary} />
                      </TouchableOpacity>
                      {schoolsList.length > 1 && (
                        <TouchableOpacity
                          style={{ padding: 6, borderRadius: 8, backgroundColor: '#FEE2E2' }}
                          onPress={() => handleDeleteSchoolHandler(sch)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="trash-outline" size={15} color="#DC2626" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* Yeni Okul Ekle Formu */}
              {isAddingSchool ? (
                <View style={{ backgroundColor: '#F8FAFC', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, gap: 12, marginTop: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textPrimary }}>
                    Yeni Okul Tanımla
                  </Text>
                  
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 }}>
                      Okul / Kurum Adı
                    </Text>
                    <TextInput
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: Colors.border,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        fontSize: 14,
                        color: Colors.textPrimary,
                      }}
                      placeholder="Örn: Atatürk Anadolu Lisesi"
                      placeholderTextColor={Colors.textMuted}
                      value={newSchoolName}
                      onChangeText={setNewSchoolName}
                    />
                  </View>

                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 }}>
                      Okulun Renk Temasını Seçin
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {SCHOOL_COLORS.map((c) => (
                        <TouchableOpacity
                          key={c.color}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            backgroundColor: c.color,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: newSchoolColor === c.color ? 3 : 0,
                            borderColor: '#0F172A',
                          }}
                          onPress={() => setNewSchoolColor(c.color)}
                        >
                          {newSchoolColor === c.color && (
                            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: Colors.cardSubtle,
                        alignItems: 'center',
                      }}
                      onPress={() => setIsAddingSchool(false)}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textSecondary }}>
                        Vazgeç
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: newSchoolColor,
                        alignItems: 'center',
                      }}
                      onPress={handleCreateSchool}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                        Okulu Kaydet & Geç
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: activeSchool?.color || Colors.primary,
                    gap: 8,
                    marginTop: 6,
                  }}
                  onPress={() => setIsAddingSchool(true)}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                    Yeni Okul Ekle
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
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
  contentContainer: {
    padding: 12,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  topBarLogo: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E7FF',
    ...Shadows.small,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  greetingTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  clockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
    ...Shadows.small,
  },
  clockText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  settingsHeaderBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.small,
  },
  exitHeaderBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  heroCardContainer: {
    marginTop: 0,
    marginBottom: 1,
  },
  activeCard: {
    backgroundColor: '#FFFFFF',
    borderColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 0,
  },
  activeBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 4,
  },
  activeStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  pulsingDot: {
    width: 6.5,
    height: 6.5,
    borderRadius: 3.5,
    backgroundColor: Colors.success,
  },
  liveText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.successDark,
    letterSpacing: 0.3,
  },
  nextIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  nextText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.primaryDark,
    letterSpacing: 0.3,
  },
  otherIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  otherText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  heroRightControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroCurrentJumpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
    paddingHorizontal: 5,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  heroCurrentJumpBtnActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  heroCurrentJumpBtnText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.primary,
  },
  heroNavContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 2,
    paddingVertical: 1,
    gap: 1,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  heroNavArrowBtn: {
    width: 22,
    height: 22,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  heroNavArrowDisabled: {
    backgroundColor: 'transparent',
    opacity: 0.35,
  },
  heroNavCounter: {
    fontSize: 10.5,
    fontWeight: '700',
    color: Colors.textSecondary,
    minWidth: 24,
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  heroCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    gap: 4,
  },
  heroClassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  heroClassBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  heroCourseNameText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  heroDotSeparator: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  heroSlotBadge: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  heroSlotBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  heroClassroomText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  expandedTopicCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 3.5,
    borderLeftColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 6,
  },
  expandedTopicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  topicHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topicBookIconBg: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedTopicLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: Colors.primaryDark,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  topicHeaderBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topicWeekBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  topicWeekBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  topicCopyIconBtn: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  expandedTopicText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 18.5,
  },
  expandedOutcomeText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 3,
    lineHeight: 15,
  },
  topicLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  topicLoadingText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  topicEmptyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  topicEmptyText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 0,
    marginBottom: 0,
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  cardActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  idleCard: {
    backgroundColor: Colors.card,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 0,
  },
  idleIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.secondaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  idleIndicatorText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.secondary,
    letterSpacing: 0.3,
  },
  idleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  idleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleTextWrap: {
    flex: 1,
  },
  idleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  idleSub: {
    fontSize: 11.5,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.small,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeader: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 16,
    marginBottom: 10,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  scheduleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 4,
  },
  dayNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  navArrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.small,
  },
  dayTitleContainer: {
    justifyContent: 'center',
  },
  dayMainTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  daySubTitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  todayPill: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#31C48D',
  },
  todayPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#03543F',
  },
  returnTodayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  returnTodayBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  quickGrid: {
    marginBottom: 10,
    gap: 10,
    
  },
  quickRow: {
    flexDirection: 'row',
    gap: 10,
   
  },
  quickBtn: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.small,
  },
  quickIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickTextWrap: {
    flex: 1,
  },
  quickTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  quickSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  emptyTodayCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyTodayText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  addScheduleLink: {
    marginTop: 10,
  },
  addScheduleLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  allProgramsSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    paddingHorizontal: 28,
    paddingVertical: 1,
    borderRadius: 8,
    marginBottom: 3,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.small,
    height:35,
    
  },
  allProgramsSwitchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  allProgramsSwitchLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textPrimary,
    
  },
  schoolsCountBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 2,
  },
  schoolsCountBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 2,
  },
  schoolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    borderWidth: 1,
  },
  schoolPillDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  schoolPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  conflictWarningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
  },
  conflictWarningText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#B45309',
  },
  timelineCard: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  timelineActive: {
    borderColor: Colors.primary,
    backgroundColor: '#F8FAFC',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeColumn: {
    width: 76,
  },
  slotName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  timeRange: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  lessonDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
    marginHorizontal: 6,
  },
  lessonContent: {
    flex: 1,
  },
  lessonHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lessonClass: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  lessonCourse: {
    fontSize: 11.5,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 0,
  },
  classroomSmall: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  timeColumnTouch: {
    width: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    marginTop: 2,
    gap: 2,
  },
  defterPillText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  classNameTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 1,
  },
  planCardBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 6,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
    marginLeft: 4,
  },
  planBtnIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  planCardBtnText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: Colors.primary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    ...Shadows.large,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 12,
  },
  modalClassTag: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modalCourseTag: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 4,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLoadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLoadingText: {
    marginTop: 10,
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  modalEmptyWrap: {
    paddingVertical: 36,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 12,
  },
  modalEmptyDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  modalEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 16,
    gap: 6,
  },
  modalEmptyBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalScroll: {
    marginTop: 4,
  },
  topicStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  stepArrowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  stepArrowBtnDisabled: {
    opacity: 0.4,
  },
  stepArrowText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  stepCounterText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  topicSectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 8,
  },
  noAdjacentBox: {
    padding: 10,
    backgroundColor: Colors.background,
    borderRadius: 8,
    marginBottom: 8,
  },
  noAdjacentText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  adjacentCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    marginBottom: 8,
  },
  adjacentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  offsetBadgeGray: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  offsetBadgeTextGray: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  offsetBadgeBlue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  offsetBadgeTextBlue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  adjacentMetaText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  adjacentTopicText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  currentTopicHeroCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#22C55E',
    padding: 14,
    marginVertical: 12,
    ...Shadows.medium,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16A34A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mainBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  heroWeekText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  heroDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 10,
  },
  heroTopicBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginBottom: 10,
  },
  heroTopicText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  outcomesContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#22C55E',
  },
  outcomesLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
    marginBottom: 2,
  },
  outcomesBody: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  heroCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    paddingVertical: 11,
    borderRadius: 10,
    gap: 8,
    ...Shadows.small,
  },
  heroCopyBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  yearlyPlanModalContainer: {
    maxHeight: '96%',
    height: '96%',
    paddingTop: Platform.OS === 'ios' ? 44 : 16,
    paddingBottom: 16,
  },
  yearlyPlanActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  pdfOpenBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
    gap: 4,
  },
  pdfOpenBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  planManageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
    gap: 4,
  },
  planManageBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  dateFilterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  dateFilterInputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 34,
    gap: 4,
  },
  dateFilterInput: {
    flex: 1,
    fontSize: 11,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  dateFilterText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  headerTodayIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayJumpIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    height: 34,
    paddingHorizontal: 9,
    borderRadius: 8,
    gap: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  todayJumpIconBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  planItemCardHighlighted: {
    borderColor: Colors.primary,
    borderWidth: 2,
    backgroundColor: '#EEF2FF',
  },
  planItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
    ...Shadows.small,
  },
  planItemCardActive: {
    borderColor: Colors.primary,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
  },
  planItemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  weekBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  weekBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  planDateInlineText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  planHoursText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  planDateText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
    marginBottom: 6,
  },
  planSubjectText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 20,
    marginBottom: 6,
  },
  planOutcomesWrap: {
    backgroundColor: Colors.background,
    borderRadius: 6,
    padding: 8,
    marginTop: 4,
    borderLeftWidth: 2,
    borderLeftColor: Colors.primary,
  },
  planOutcomesLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  planOutcomesBody: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  headerAgendaBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: Colors.danger,
    borderRadius: 8,
    minWidth: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  headerAgendaBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  alertBannerContainer: {
    marginBottom: 10,
    gap: 8,
  },
  alertBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
    borderLeftWidth: 5,
    borderLeftColor: '#F59E0B',
    ...Shadows.small,
  },
  alertBannerCardUrgent: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderLeftColor: '#EF4444',
  },
  alertBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 8,
  },
  alertIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  alertBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  alertTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FDE68A',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  alertTimeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#78350F',
  },
  alertTitleText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  alertDescText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  alertQuickCheckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  alertQuickCheckText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  todayAgendaSection: {
    marginTop: 10,
    marginBottom: 12,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.small,
  },
  todayAgendaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    marginBottom: 8,
  },
  agendaSectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayAgendaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  agendaCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  agendaCountBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  todayAgendaSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  agendaQuickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  agendaQuickAddText: {
    fontSize: 11,
    fontWeight: '700',
  },
  agendaViewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  agendaViewAllText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  agendaEmptyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  agendaEmptyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaEmptyTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  agendaEmptyText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  agendaItemsList: {
    gap: 6,
  },
  agendaItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  agendaItemRowAlert: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
    backgroundColor: '#FFFDFD',
  },
  agendaItemRowCompleted: {
    opacity: 0.6,
    backgroundColor: '#F1F5F9',
  },
  agendaCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  agendaCheckboxPending: {
    borderColor: Colors.divider,
    backgroundColor: '#FFFFFF',
  },
  agendaCheckboxDone: {
    borderColor: Colors.success,
    backgroundColor: Colors.success,
  },
  agendaItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  agendaItemTitleDone: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  agendaMiniAlertPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.dangerLight,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  agendaMiniAlertText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.danger,
  },
  agendaTimeMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  agendaTimeMiniText: {
    fontSize: 10.5,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  agendaCategoryMiniText: {
    fontSize: 10.5,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  agendaDateBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  agendaDateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
});
