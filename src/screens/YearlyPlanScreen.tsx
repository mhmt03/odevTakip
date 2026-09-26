import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { EmptyState } from '../components/EmptyState';
import {
  getYearlyPlans,
  createYearlyPlan,
  updateYearlyPlan,
  deleteYearlyPlan,
} from '../database/operations/yearlyPlanOperations';
import { getCourses } from '../database/operations/scheduleOperations';
import { getClasses } from '../database/operations/classOperations';
import { getTodayDateString, formatDateToTR } from '../utils/dateUtils';
import { YearlyPlanItem, CourseName, ClassItem } from '../types';

export const YearlyPlanScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [courses, setCourses] = useState<CourseName[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [plans, setPlans] = useState<YearlyPlanItem[]>([]);

  // Add / Edit Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState<YearlyPlanItem | null>(null);
  const [formCourseId, setFormCourseId] = useState<number | null>(null);
  const [formClassId, setFormClassId] = useState<number | null>(null);
  const [formWeek, setFormWeek] = useState('1');
  const [formTopic, setFormTopic] = useState('');
  const [formOutcomes, setFormOutcomes] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');

  const loadData = async () => {
    try {
      const [crs, cls] = await Promise.all([getCourses(), getClasses()]);
      setCourses(crs);
      setClasses(cls);

      let targetCourseId = selectedCourseId;
      if (!targetCourseId && crs.length > 0) {
        targetCourseId = crs[0].id;
        setSelectedCourseId(targetCourseId);
      }

      if (targetCourseId) {
        const planList = await getYearlyPlans(targetCourseId);
        setPlans(planList);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [selectedCourseId])
  );

  const handleSelectCourse = async (courseId: number) => {
    setSelectedCourseId(courseId);
    try {
      const planList = await getYearlyPlans(courseId);
      setPlans(planList);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenAdd = () => {
    setEditingPlan(null);
    setFormCourseId(selectedCourseId || (courses[0]?.id ?? null));
    setFormClassId(null);
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
    setFormClassId(item.class_id || null);
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
      Alert.alert('Uyarı', 'Lütfen anlatılacak konuyu giriniz.');
      return;
    }
    const weekNum = parseInt(formWeek, 10);
    if (isNaN(weekNum) || weekNum < 1) {
      Alert.alert('Uyarı', 'Geçerli bir hafta numarası giriniz.');
      return;
    }

    try {
      if (editingPlan) {
        await updateYearlyPlan(
          editingPlan.id,
          formCourseId,
          weekNum,
          formTopic.trim(),
          formClassId,
          formStartDate.trim() || undefined,
          formEndDate.trim() || undefined,
          formOutcomes.trim() || undefined
        );
      } else {
        await createYearlyPlan(
          formCourseId,
          weekNum,
          formTopic.trim(),
          formClassId,
          formStartDate.trim() || undefined,
          formEndDate.trim() || undefined,
          formOutcomes.trim() || undefined
        );
      }
      setModalVisible(false);
      loadData();
    } catch (e) {
      Alert.alert('Hata', 'Yıllık plan kaydedilemedi.');
    }
  };

  const handleDelete = (item: YearlyPlanItem) => {
    Alert.alert('Planı Sil', `"${item.week_number}. Hafta: ${item.subject_topic}" kaydını silmek istiyor musunuz?`, [
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
    ]);
  };

  const today = getTodayDateString();

  return (
    <View style={styles.container}>
      <Header
        title="Yıllık Müfredat Planı"
        subtitle="Haftalık konu ve kazanım takibi"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={{
          icon: 'add',
          label: 'Ekle',
          onPress: handleOpenAdd,
        }}
      />

      {/* Course Selector Chips */}
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
                  {crs.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={plans}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon="calendar-outline"
            title="Yıllık Plan Bulunmuyor"
            description="Bu ders için henüz haftalık müfredat planı girilmemiş."
            actionTitle="Haftalık Plan Ekle"
            onAction={handleOpenAdd}
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

                {item.class_name ? (
                  <View style={styles.classBadge}>
                    <Text style={styles.classBadgeText}>{item.class_name}</Text>
                  </View>
                ) : null}

                {isCurrentWeek ? (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>Bu Hafta</Text>
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

      {/* Add / Edit Plan Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingPlan ? 'Planı Düzenle' : 'Yeni Müfredat Konusu Ekle'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              <Input
                label="Hafta Numarası (1 - 36) *"
                placeholder="Örn: 3"
                value={formWeek}
                onChangeText={setFormWeek}
                keyboardType="numeric"
              />

              <Input
                label="İşlenecek Konu *"
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  courseChipsBar: {
    backgroundColor: Colors.card,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.textInverse,
  },
  listContent: {
    padding: 16,
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
    gap: 8,
  },
  weekBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  weekText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  classBadge: {
    backgroundColor: Colors.cardSubtle,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  classBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
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
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  outcomesText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
    lineHeight: 18,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  dateText: {
    fontSize: 12,
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
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  datesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
});
