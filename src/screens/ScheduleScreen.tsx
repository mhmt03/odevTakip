import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  FlatList,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import {
  getLessonSlots,
  getScheduleByDay,
  saveScheduleSlot,
  getCourses,
  getWeeklySchedule,
} from '../database/operations/scheduleOperations';
import { getClasses } from '../database/operations/classOperations';
import { exportScheduleToExcel } from '../utils/excelService';
import { DAYS_OF_WEEK, getDayOfWeekIndex, isTimeBetween, getCurrentTimeString } from '../utils/dateUtils';
import { LessonSlot, ScheduleItem, CourseName, ClassItem } from '../types';

export const ScheduleScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [selectedDay, setSelectedDay] = useState<number>(() => {
    const idx = getDayOfWeekIndex();
    return idx > 5 ? 1 : idx; // default to today (or Monday if weekend)
  });

  const [slots, setSlots] = useState<LessonSlot[]>([]);
  const [daySchedule, setDaySchedule] = useState<ScheduleItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [courses, setCourses] = useState<CourseName[]>([]);

  // Slot Edit Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [activeSlot, setActiveSlot] = useState<LessonSlot | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [classroomInput, setClassroomInput] = useState('');

  const loadData = async () => {
    try {
      const [allSlots, cls, crs] = await Promise.all([
        getLessonSlots(),
        getClasses(),
        getCourses(),
      ]);
      setSlots(allSlots);
      setClasses(cls);
      setCourses(crs);

      const currentDayItems = await getScheduleByDay(selectedDay);
      setDaySchedule(currentDayItems);
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [selectedDay])
  );

  const handleOpenSlotModal = (slot: LessonSlot) => {
    setActiveSlot(slot);
    const existing = daySchedule.find((item) => item.slot_id === slot.id);
    setSelectedClassId(existing?.class_id || null);
    setSelectedCourseId(existing?.course_id || null);
    setClassroomInput(existing?.classroom || '');
    setModalVisible(true);
  };

  const handleSaveSlot = async () => {
    if (!activeSlot) return;
    try {
      await saveScheduleSlot(
        selectedDay,
        activeSlot.id,
        selectedClassId,
        selectedCourseId,
        classroomInput.trim()
      );
      setModalVisible(false);
      loadData();
    } catch (e) {
      Alert.alert('Hata', 'Ders programı kaydedilemedi.');
    }
  };

  const handleClearSlot = async () => {
    if (!activeSlot) return;
    try {
      await saveScheduleSlot(selectedDay, activeSlot.id, null, null);
      setModalVisible(false);
      loadData();
    } catch (e) {
      Alert.alert('Hata', 'Kayıt temizlenemedi.');
    }
  };

  const handleExportSchedule = async () => {
    try {
      const allSlots = await getLessonSlots();
      const allSchedule = await getWeeklySchedule();
      await exportScheduleToExcel(allSlots, allSchedule);
    } catch (e) {
      Alert.alert('Hata', 'Excel programı oluşturulamadı.');
    }
  };

  const currentTime = getCurrentTimeString();
  const currentDayIndex = getDayOfWeekIndex();

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Haftalık Ders Programı</Text>
          <Text style={styles.headerSub}>Şube ve ders saatleri yönetimi</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.actionBtnIcon}
            onPress={() => navigation.navigate('ScheduleManage')}
          >
            <Ionicons name="settings-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtnIcon}
            onPress={handleExportSchedule}
          >
            <Ionicons name="share-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Days Selector */}
      <View style={styles.daysBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysScroll}>
          {DAYS_OF_WEEK.slice(0, 6).map((day) => {
            const isSelected = selectedDay === day.id;
            const isToday = currentDayIndex === day.id;
            return (
              <TouchableOpacity
                key={day.id}
                style={[styles.dayTab, isSelected && styles.dayTabActive]}
                onPress={() => setSelectedDay(day.id)}
              >
                <Text style={[styles.dayTabText, isSelected && styles.dayTabTextActive]}>
                  {day.shortName}
                </Text>
                {isToday && (
                  <View
                    style={[
                      styles.todayIndicator,
                      isSelected ? { backgroundColor: '#fff' } : null,
                    ]}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Lesson Slots List for Day */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {slots.length === 0 ? (
          <Card style={styles.emptySlotsCard}>
            <Text style={styles.emptySlotsText}>Ders saati tanımlı değil.</Text>
            <Button
              title="Saatleri Tanımla"
              size="sm"
              style={{ marginTop: 10 }}
              onPress={() => navigation.navigate('ScheduleManage')}
            />
          </Card>
        ) : (
          slots.map((slot) => {
            const match = daySchedule.find((item) => item.slot_id === slot.id);
            const hasLesson = match && (match.class_name || match.course_name);
            const isNow =
              selectedDay === currentDayIndex &&
              isTimeBetween(currentTime, slot.start_time, slot.end_time);

            return (
              <TouchableOpacity
                key={slot.id}
                activeOpacity={0.8}
                onPress={() => handleOpenSlotModal(slot)}
              >
                <Card
                  style={[styles.slotCard, isNow && styles.slotCardNow]}
                  highlightBorder={isNow ? Colors.success : hasLesson ? Colors.primary : undefined}
                >
                  <View style={styles.slotRow}>
                    <View style={styles.slotTimeWrap}>
                      <Text style={styles.slotNum}>{slot.slot_name}</Text>
                      <Text style={styles.slotTimes}>
                        {slot.start_time} - {slot.end_time}
                      </Text>
                    </View>

                    <View style={styles.slotDivider} />

                    <View style={styles.slotContentWrap}>
                      {hasLesson ? (
                        <>
                          <View style={styles.slotTitleRow}>
                            <Text style={styles.slotClass}>{match.class_name || '-'}</Text>
                            {isNow && (
                              <View style={styles.nowBadge}>
                                <Text style={styles.nowBadgeText}>Şu An</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.slotCourse}>{match.course_name || '-'}</Text>
                          {match.classroom && (
                            <Text style={styles.slotRoom}>Derslik: {match.classroom}</Text>
                          )}
                        </>
                      ) : (
                        <View style={styles.emptySlotContent}>
                          <Text style={styles.emptySlotLabel}>Boş Ders</Text>
                          <Text style={styles.emptySlotSub}>Ders atamak için tıklayın</Text>
                        </View>
                      )}
                    </View>

                    <Ionicons name="create-outline" size={18} color={Colors.textMuted} />
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Edit Slot Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{activeSlot?.slot_name} Düzenle</Text>
                <Text style={styles.modalSub}>
                  {DAYS_OF_WEEK.find((d) => d.id === selectedDay)?.name} (
                  {activeSlot?.start_time} - {activeSlot?.end_time})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
              {/* Select Class */}
              <Text style={styles.selectLabel}>Şube Seçin:</Text>
              <View style={styles.selectGrid}>
                {classes.map((c) => {
                  const isSel = selectedClassId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.selOption, isSel && styles.selOptionActive]}
                      onPress={() => setSelectedClassId(isSel ? null : c.id)}
                    >
                      <Text style={[styles.selOptionText, isSel && styles.selOptionTextActive]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Select Course */}
              <Text style={styles.selectLabel}>Ders Seçin:</Text>
              <View style={styles.selectGrid}>
                {courses.map((crs) => {
                  const isSel = selectedCourseId === crs.id;
                  return (
                    <TouchableOpacity
                      key={crs.id}
                      style={[styles.selOption, isSel && styles.selOptionActive]}
                      onPress={() => setSelectedCourseId(isSel ? null : crs.id)}
                    >
                      <Text style={[styles.selOptionText, isSel && styles.selOptionTextActive]}>
                        {crs.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Optional Classroom input */}
              <Input
                label="Derslik / Sınıf (Opsiyonel)"
                placeholder="Örn: Fizik Lab, 204 vb."
                value={classroomInput}
                onChangeText={setClassroomInput}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title="Boşalt"
                variant="outline"
                style={{ flex: 1 }}
                onPress={handleClearSlot}
              />
              <Button
                title="Kaydet"
                style={{ flex: 2 }}
                onPress={handleSaveSlot}
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
    gap: 8,
  },
  actionBtnIcon: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
  },
  daysBar: {
    backgroundColor: Colors.card,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  daysScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  dayTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  dayTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayTabText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  dayTabTextActive: {
    color: Colors.textInverse,
  },
  todayIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginTop: 3,
  },
  scrollContent: {
    padding: 16,
  },
  emptySlotsCard: {
    alignItems: 'center',
    padding: 24,
  },
  emptySlotsText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  slotCard: {
    padding: 14,
    marginBottom: 8,
  },
  slotCardNow: {
    backgroundColor: '#F8FAFC',
    borderColor: Colors.success,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slotTimeWrap: {
    width: 90,
  },
  slotNum: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  slotTimes: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  slotDivider: {
    width: 1,
    height: 38,
    backgroundColor: Colors.border,
    marginHorizontal: 12,
  },
  slotContentWrap: {
    flex: 1,
  },
  slotTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slotClass: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  nowBadge: {
    backgroundColor: Colors.successLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nowBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.successDark,
  },
  slotCourse: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  slotRoom: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptySlotContent: {
    justifyContent: 'center',
  },
  emptySlotLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  emptySlotSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
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
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalSub: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  selectLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
    marginTop: 6,
  },
  selectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  selOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  selOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  selOptionTextActive: {
    color: Colors.textInverse,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
});
