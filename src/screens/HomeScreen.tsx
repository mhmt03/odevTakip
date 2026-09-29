import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Colors, Shadows } from '../theme/colors';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import {
  getActiveAndTodayLessons,
  ActiveLessonInfo,
  getScheduleByDay,
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
} from '../utils/dateUtils';
import { YearlyPlanItem, ScheduleItem } from '../types';

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(getCurrentTimeString());

  const todayIndex = getDayOfWeekIndex();
  const [selectedDay, setSelectedDay] = useState<number>(todayIndex);
  const [displayedLessons, setDisplayedLessons] = useState<ScheduleItem[]>([]);

  const [lessonInfo, setLessonInfo] = useState<ActiveLessonInfo>({
    currentLesson: null,
    nextLesson: null,
    todayLessons: [],
  });
  const [currentTopic, setCurrentTopic] = useState<YearlyPlanItem | null>(null);
  const [stats, setStats] = useState({
    classCount: 0,
    studentCount: 0,
    pendingAssignments: 0,
  });

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

  const loadDaySchedule = async (day: number) => {
    try {
      const items = await getScheduleByDay(day);
      setDisplayedLessons(items.filter((item) => item.class_id || item.course_id));
    } catch (e) {
      console.error(e);
    }
  };

  const loadData = async () => {
    try {
      setCurrentTime(getCurrentTimeString());
      const info = await getActiveAndTodayLessons();
      setLessonInfo(info);
      await loadDaySchedule(selectedDay);

      if (info.currentLesson && info.currentLesson.class_id) {
        const topic = await getCurrentTopicForClass(
          info.currentLesson.class_id,
          info.currentLesson.course_id || undefined,
          info.currentLesson.day_of_week,
          info.currentLesson.slot_id
        );
        setCurrentTopic(topic);
      } else {
        setCurrentTopic(null);
      }

      const classes = await getClasses();
      const totalStudents = classes.reduce((sum, c) => sum + (c.student_count || 0), 0);
      const assignments = await getAssignments();
      const pendingCount = assignments.reduce((sum, a) => sum + (a.pending_count || 0), 0);

      setStats({
        classCount: classes.length,
        studentCount: totalStudents,
        pendingAssignments: pendingCount,
      });
    } catch (error) {
      console.error('Error loading home data:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
      const interval = setInterval(() => {
        setCurrentTime(getCurrentTimeString());
        getActiveAndTodayLessons().then(async (info) => {
          setLessonInfo(info);
          if (info.currentLesson && info.currentLesson.class_id) {
            const topic = await getCurrentTopicForClass(
              info.currentLesson.class_id,
              info.currentLesson.course_id || undefined,
              info.currentLesson.day_of_week,
              info.currentLesson.slot_id
            );
            setCurrentTopic(topic);
          } else {
            setCurrentTopic(null);
          }
        });
      }, 30000); // 30 sec tick
      return () => clearInterval(interval);
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  useEffect(() => {
    loadDaySchedule(selectedDay);
  }, [selectedDay]);

  const handlePrevDay = () => {
    setSelectedDay((prev) => (prev <= 1 ? 7 : prev - 1));
  };

  const handleNextDay = () => {
    setSelectedDay((prev) => (prev >= 7 ? 1 : prev + 1));
  };

  const handleJumpToToday = () => {
    setSelectedDay(todayIndex);
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
    if (!item.course_id) {
      Alert.alert('Bilgi', 'Bu ders için ders bilgisi bulunmuyor.');
      return;
    }
    const m = item.class_name?.match(/\d+/);
    const gradeLevel = m ? parseInt(m[0], 10) : 0;
    const meta = {
      gradeLevel,
      className: item.class_name || '',
      courseName: item.course_name || '',
      courseId: item.course_id,
    };
    setYearlyPlanMeta(meta);
    setPlanSearchQuery('');
    setYearlyPlanLoading(true);
    setYearlyPlanModalVisible(true);

    try {
      const [plans, doc] = await Promise.all([
        getYearlyPlans(item.course_id, gradeLevel || undefined, item.class_id || undefined),
        gradeLevel ? getYearlyPlanDocument(item.course_id, gradeLevel) : Promise.resolve(null),
      ]);
      setYearlyPlanList(plans);
      setYearlyPlanPdf(doc);
    } catch (e) {
      console.error('Error loading yearly plan:', e);
      Alert.alert('Hata', 'Yıllık plan yüklenirken bir sorun oluştu.');
    } finally {
      setYearlyPlanLoading(false);
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
    if (!planSearchQuery.trim()) return true;
    const q = planSearchQuery.toLowerCase();
    return (
      p.subject_topic.toLowerCase().includes(q) ||
      (p.learning_outcomes && p.learning_outcomes.toLowerCase().includes(q)) ||
      `hafta ${p.week_number}`.includes(q) ||
      `${p.week_number}. hafta`.includes(q)
    );
  });

  const isViewingToday = selectedDay === todayIndex;
  const selectedDayObj = DAYS_OF_WEEK.find((d) => d.id === selectedDay);
  const todayName = DAYS_OF_WEEK.find((d) => d.id === todayIndex)?.name || 'Bugün';

  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 20
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, { paddingTop: topInset + 8 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
      {/* Top Welcome Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.dateText}>
            {todayName}, {formatDateToTR(new Date().toISOString().split('T')[0])}
          </Text>
          <Text style={styles.greetingTitle}>Sınıf Takip & Ajanda</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.clockBadge}>
            <Ionicons name="time-outline" size={16} color={Colors.primary} />
            <Text style={styles.clockText}>{currentTime}</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsHeaderBtn}
            onPress={() => navigation.navigate('Operations')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="options-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ACTIVE LESSON HERO CARD */}
      <View style={styles.heroCardContainer}>
        {lessonInfo.currentLesson ? (
          <Card style={styles.activeCard} highlightBorder={Colors.success}>
            <View style={styles.activeBadgeRow}>
              <View style={styles.liveIndicator}>
                <View style={styles.pulsingDot} />
                <Text style={styles.liveText}>ŞU ANDAKİ DERS</Text>
              </View>
              <Badge
                label={`${lessonInfo.currentLesson.start_time} - ${lessonInfo.currentLesson.end_time}`}
                status="yapildi"
                size="sm"
              />
            </View>

            <View style={styles.activeDetails}>
              <Text style={styles.activeClass}>
                {lessonInfo.currentLesson.class_name || 'Şube Belirtilmemiş'}
              </Text>
              <Text style={styles.activeCourse}>
                {lessonInfo.currentLesson.course_code ? `[${lessonInfo.currentLesson.course_code}] ` : ''}
                {lessonInfo.currentLesson.course_name || 'Ders Belirtilmemiş'} •{' '}
                {lessonInfo.currentLesson.slot_name || ''}
              </Text>
              {lessonInfo.currentLesson.classroom && (
                <Text style={styles.classroomText}>
                  Derslik: {lessonInfo.currentLesson.classroom}
                </Text>
              )}
            </View>

            {currentTopic ? (
              <View style={styles.topicBox}>
                <Ionicons name="book-outline" size={16} color={Colors.primary} />
                <Text style={styles.topicText} numberOfLines={2}>
                  Deftere Yazılacak: {currentTopic.week_number ? `${currentTopic.week_number}. Hafta ` : ''}{currentTopic.lesson_hours ? `(${currentTopic.lesson_hours} Saat) - ` : '- '}{currentTopic.subject_topic}
                </Text>
              </View>
            ) : null}

            <View style={styles.cardActionsRow}>
              <TouchableOpacity
                style={styles.cardActionBtn}
                onPress={() => {
                  if (lessonInfo.currentLesson?.class_id) {
                    navigation.navigate('ClassDetail', {
                      classId: lessonInfo.currentLesson.class_id,
                      className: lessonInfo.currentLesson.class_name,
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
                    initialClassId: lessonInfo.currentLesson?.class_id,
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
          <Card style={styles.idleCard}>
            <View style={styles.idleRow}>
              <View style={styles.idleIconWrap}>
                <Ionicons name="cafe-outline" size={28} color={Colors.secondary} />
              </View>
              <View style={styles.idleTextWrap}>
                <Text style={styles.idleTitle}>Şu An Boş Ders</Text>
                <Text style={styles.idleSub}>
                  {lessonInfo.nextLesson
                    ? `Sıradaki: ${lessonInfo.nextLesson.start_time} ${lessonInfo.nextLesson.class_name || ''} - ${lessonInfo.nextLesson.course_name || ''}`
                    : 'Bugün için başka planlanmış ders bulunmuyor.'}
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

          return (
            <Card
              key={`${item.slot_id}-${index}`}
              style={[styles.timelineCard, isCurrent ? styles.timelineActive : null]}
              highlightBorder={isCurrent ? Colors.primary : undefined}
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
                  <View style={styles.defterPill}>
                    <Ionicons name="create-outline" size={11} color={Colors.primary} />
                    <Text style={styles.defterPillText}>Defter</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.lessonDivider} />

                {/* 2. ORTA BÖLÜM: ŞUBE ADI (Dokununca şube öğrencilerine gider) & DERS */}
                <View style={styles.lessonContent}>
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
                      <Ionicons name="people-circle-outline" size={16} color={Colors.primary} />
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
                  <View style={styles.planBtnIconWrap}>
                    <Ionicons name="book-outline" size={15} color={Colors.primary} />
                  </View>
                  <Text style={styles.planCardBtnText}>Plan</Text>
                </TouchableOpacity>
              </View>
            </Card>
          );
        })
      )}

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
          <View style={styles.modalContainer}>
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
              <TouchableOpacity
                onPress={() => setYearlyPlanModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Üst İşlem Butonları */}
            <View style={styles.yearlyPlanActionsRow}>
              {yearlyPlanPdf && (
                <TouchableOpacity
                  style={styles.pdfOpenBtn}
                  onPress={() =>
                    viewYearlyPlanPdf(
                      yearlyPlanPdf.file_uri,
                      `${yearlyPlanMeta?.gradeLevel}. Sınıf ${yearlyPlanMeta?.courseName} Yıllık Planı`
                    )
                  }
                >
                  <Ionicons name="document-text" size={16} color="#FFFFFF" />
                  <Text style={styles.pdfOpenBtnText}>PDF Planı Aç</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.planManageBtn}
                onPress={() => {
                  setYearlyPlanModalVisible(false);
                  navigation.navigate('YearlyPlan');
                }}
              >
                <Ionicons name="create-outline" size={16} color={Colors.primary} />
                <Text style={styles.planManageBtnText}>Planı Yönet</Text>
              </TouchableOpacity>
            </View>

            {/* Arama Çubuğu */}
            <View style={styles.searchBarWrap}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Konu, hafta veya kazanım ara..."
                placeholderTextColor={Colors.textMuted}
                value={planSearchQuery}
                onChangeText={setPlanSearchQuery}
              />
              {planSearchQuery ? (
                <TouchableOpacity onPress={() => setPlanSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>

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
                  {planSearchQuery
                    ? 'Aramanıza uygun plan satırı bulunamadı.'
                    : 'Bu sınıf düzeyi için henüz yıllık plan yüklenmemiş.'}
                </Text>
                {!planSearchQuery && (
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
                style={styles.modalScroll}
                contentContainerStyle={{ paddingBottom: 30 }}
                showsVerticalScrollIndicator={true}
              >
                {filteredPlanList.map((plan) => {
                  const todayStr = getTodayDateString();
                  const isThisWeek =
                    Boolean(plan.date_start && plan.date_end && plan.date_start <= todayStr && plan.date_end >= todayStr);

                  return (
                    <View
                      key={plan.id}
                      style={[
                        styles.planItemCard,
                        isThisWeek && styles.planItemCardActive,
                      ]}
                    >
                      <View style={styles.planItemHeaderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
                          {isThisWeek && (
                            <Badge label="Bu Hafta" status="yapildi" size="sm" />
                          )}
                        </View>

                        <Text style={styles.planHoursText}>
                          {plan.lesson_hours ? `${plan.lesson_hours} Saat` : ''}
                        </Text>
                      </View>

                      {plan.date_start && plan.date_end && (
                        <Text style={styles.planDateText}>
                          📅 {formatDateToTR(plan.date_start)} - {formatDateToTR(plan.date_end)}
                        </Text>
                      )}

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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
    ...Shadows.small,
  },
  clockText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  settingsHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.small,
  },
  heroCardContainer: {
    marginBottom: 16,
  },
  activeCard: {
    backgroundColor: '#FFFFFF',
    borderColor: Colors.primaryLight,
  },
  activeBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.successDark,
    letterSpacing: 0.8,
  },
  activeDetails: {
    marginBottom: 12,
  },
  activeClass: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  activeCourse: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 2,
  },
  classroomText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  topicBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
    gap: 8,
  },
  topicText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primaryDark,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  cardActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  idleCard: {
    backgroundColor: Colors.card,
  },
  idleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  idleIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleTextWrap: {
    flex: 1,
  },
  idleTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  idleSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
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
    marginBottom: 12,
  },
  dayNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  navArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
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
    marginBottom: 20,
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
    padding: 14,
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
  timelineCard: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
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
    width: 90,
  },
  slotName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  timeRange: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  lessonDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
    marginHorizontal: 10,
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
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  lessonCourse: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 1,
  },
  classroomSmall: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  timeColumnTouch: {
    width: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
    gap: 3,
  },
  defterPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  classNameTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  planCardBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
    marginLeft: 6,
  },
  planBtnIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  planCardBtnText: {
    fontSize: 10,
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
  yearlyPlanActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  pdfOpenBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  pdfOpenBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  planManageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  planManageBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  planItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
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
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  weekBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  planHoursText: {
    fontSize: 12,
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
});
