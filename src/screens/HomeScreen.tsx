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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
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
import { getCurrentTopicForClass } from '../database/operations/yearlyPlanOperations';
import { DAYS_OF_WEEK, getDayOfWeekIndex, formatDateToTR, getCurrentTimeString } from '../utils/dateUtils';
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

  const isViewingToday = selectedDay === todayIndex;
  const selectedDayObj = DAYS_OF_WEEK.find((d) => d.id === selectedDay);
  const todayName = DAYS_OF_WEEK.find((d) => d.id === todayIndex)?.name || 'Bugün';

  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 20
  );

  return (
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

      {/* QUICK STATS */}
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
                <View style={styles.timeColumn}>
                  <Text style={styles.slotName}>{item.slot_name}</Text>
                  <Text style={styles.timeRange}>
                    {item.start_time} - {item.end_time}
                  </Text>
                </View>

                <View style={styles.lessonDivider} />

                <View style={styles.lessonContent}>
                  <View style={styles.lessonHeaderRow}>
                    <Text style={styles.lessonClass}>{item.class_name || '-'}</Text>
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
    </ScrollView>
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
});
