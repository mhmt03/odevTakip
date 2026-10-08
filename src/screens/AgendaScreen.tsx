import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Switch,
  Platform,
  RefreshControl,
  FlatList,
} from 'react-native';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Colors, Shadows } from '../theme/colors';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { useSchoolTheme } from '../context/SchoolThemeContext';
import {
  AgendaItem,
  AgendaCategory,
  AgendaPriority,
} from '../types';
import {
  getAgendaItems,
  createAgendaItem,
  updateAgendaItem,
  deleteAgendaItem,
  toggleAgendaItemCompleted,
  getAgendaDaysWithItems,
} from '../database/operations/agendaOperations';
import {
  formatDateToTR,
  getTodayDateString,
  DAYS_OF_WEEK,
} from '../utils/dateUtils';

interface CategoryConfig {
  key: AgendaCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bgColor: string;
}

const CATEGORIES: CategoryConfig[] = [
  { key: 'gorev', label: 'Görev', icon: 'checkbox-outline', color: '#4F46E5', bgColor: '#EEF2FF' },
  { key: 'toplanti', label: 'Toplantı', icon: 'people-outline', color: '#8B5CF6', bgColor: '#EDE9FE' },
  { key: 'sinav', label: 'Sınav / Not', icon: 'create-outline', color: '#F59E0B', bgColor: '#FEF3C7' },
  { key: 'nobet', label: 'Nöbet', icon: 'shield-checkmark-outline', color: '#14B8A6', bgColor: '#CCFBF1' },
  { key: 'hatirlatma', label: 'Hatırlatma', icon: 'notifications-outline', color: '#0284C7', bgColor: '#E0F2FE' },
  { key: 'diger', label: 'Diğer', icon: 'bookmark-outline', color: '#64748B', bgColor: '#F1F5F9' },
];

interface PriorityConfig {
  key: AgendaPriority;
  label: string;
  color: string;
  bgColor: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const PRIORITIES: PriorityConfig[] = [
  { key: 'normal', label: 'Normal', color: '#64748B', bgColor: '#F1F5F9', icon: 'remove-outline' },
  { key: 'onemli', label: 'Önemli', color: '#F59E0B', bgColor: '#FEF3C7', icon: 'alert-circle-outline' },
  { key: 'acil', label: 'Acil', color: '#EF4444', bgColor: '#FEE2E2', icon: 'flame-outline' },
];

type FilterType = 'all' | 'today' | 'upcoming' | 'urgent' | 'completed';

export const AgendaScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { themeColor, bgTint } = useSchoolTheme();

  const [items, setItems] = useState<AgendaItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('all');
  const [selectedCategory, setSelectedCategory] = useState<AgendaCategory | 'all'>('all');

  // Interactive Date Strip State
  const todayStr = getTodayDateString();
  const initialDateParam = route.params?.initialDate;
  const [selectedDate, setSelectedDate] = useState<string>(initialDateParam || todayStr);

  useEffect(() => {
    if (route.params?.initialDate) {
      setSelectedDate(route.params.initialDate);
    }
  }, [route.params?.initialDate]);
  const [currentMonthAnchor, setCurrentMonthAnchor] = useState<Date>(new Date());
  const [daysWithItemsMap, setDaysWithItemsMap] = useState<Record<string, { count: number; has_alert: boolean }>>({});

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<AgendaItem | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formHasTime, setFormHasTime] = useState(false);
  const [formTime, setFormTime] = useState<Date>(new Date());
  const [formIsAllDayAlert, setFormIsAllDayAlert] = useState(false);
  const [formCategory, setFormCategory] = useState<AgendaCategory>('gorev');
  const [formPriority, setFormPriority] = useState<AgendaPriority>('normal');

  // Date/Time pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Load items from SQLite
  const loadData = useCallback(async () => {
    try {
      const allItems = await getAgendaItems();
      setItems(allItems);

      // Month anchor format YYYY-MM
      const year = currentMonthAnchor.getFullYear();
      const month = String(currentMonthAnchor.getMonth() + 1).padStart(2, '0');
      const yearMonth = `${year}-${month}`;
      const monthDays = await getAgendaDaysWithItems(yearMonth);
      const map: Record<string, { count: number; has_alert: boolean }> = {};
      monthDays.forEach((d) => {
        map[d.date] = { count: d.count, has_alert: d.has_alert };
      });
      setDaysWithItemsMap(map);
    } catch (e) {
      console.error('Error loading agenda items:', e);
    }
  }, [currentMonthAnchor]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Generate days of the current visible week or month window
  const dateStripDays = useMemo(() => {
    const d = new Date(selectedDate || todayStr);
    const result: { dateStr: string; dayNum: number; dayName: string; isToday: boolean }[] = [];

    // Show 14 days centered around the selected date (7 before, 7 after)
    for (let offset = -5; offset <= 8; offset++) {
      const curr = new Date(d);
      curr.setDate(d.getDate() + offset);
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const day = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;

      const jsDay = curr.getDay();
      const dayIndex = jsDay === 0 ? 7 : jsDay;
      const dayObj = DAYS_OF_WEEK.find((x) => x.id === dayIndex);

      result.push({
        dateStr,
        dayNum: curr.getDate(),
        dayName: dayObj?.shortName || '',
        isToday: dateStr === todayStr,
      });
    }
    return result;
  }, [selectedDate, todayStr]);

  // Filtered items logic
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      // Main Filter tabs
      if (selectedFilter === 'today') {
        return item.date === todayStr;
      }
      if (selectedFilter === 'upcoming') {
        return item.date >= todayStr && item.is_completed === 0;
      }
      if (selectedFilter === 'urgent') {
        return (item.priority === 'acil' || item.is_all_day_alert === 1) && item.is_completed === 0;
      }
      if (selectedFilter === 'completed') {
        return item.is_completed === 1;
      }

      // If 'all' and user has a date selected in the strip, prioritize that date
      // Or show all sorted with selected date indicator
      return true;
    });
  }, [items, selectedFilter, selectedCategory, todayStr]);

  // Stats calculation
  const stats = useMemo(() => {
    const todayItems = items.filter((i) => i.date === todayStr);
    const todayTotal = todayItems.length;
    const todayCompleted = todayItems.filter((i) => i.is_completed === 1).length;
    const todayPending = todayTotal - todayCompleted;
    const urgentCount = items.filter((i) => (i.priority === 'acil' || i.is_all_day_alert === 1) && i.is_completed === 0).length;
    return { todayTotal, todayCompleted, todayPending, urgentCount };
  }, [items, todayStr]);

  // Open Form for Creating New Item
  const handleOpenAddModal = (initialDate?: string) => {
    setEditingItem(null);
    setFormTitle('');
    setFormDescription('');
    const targetDate = initialDate ? new Date(initialDate) : new Date(selectedDate || todayStr);
    setFormDate(targetDate);
    setFormHasTime(false);
    const now = new Date();
    setFormTime(now);
    setFormIsAllDayAlert(false);
    setFormCategory('gorev');
    setFormPriority('normal');
    setModalVisible(true);
  };

  // Open Form for Editing Existing Item
  const handleOpenEditModal = (item: AgendaItem) => {
    setEditingItem(item);
    setFormTitle(item.title);
    setFormDescription(item.description || '');
    setFormDate(new Date(item.date));
    setFormHasTime(item.has_time === 1);
    if (item.time) {
      const [h, m] = item.time.split(':').map(Number);
      const t = new Date();
      t.setHours(h || 0, m || 0, 0, 0);
      setFormTime(t);
    } else {
      setFormTime(new Date());
    }
    setFormIsAllDayAlert(item.is_all_day_alert === 1);
    setFormCategory(item.category || 'gorev');
    setFormPriority(item.priority || 'normal');
    setModalVisible(true);
  };

  // Toggle Item completion
  const handleToggleCompleted = async (item: AgendaItem) => {
    try {
      const nextState = item.is_completed === 1 ? 0 : 1;
      await toggleAgendaItemCompleted(item.id, nextState === 1);
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_completed: nextState } : i))
      );
    } catch (e) {
      Alert.alert('Hata', 'İşlem tamamlanamadı.');
    }
  };

  // Delete Item
  const handleDeleteItem = (item: AgendaItem) => {
    Alert.alert(
      'Görevi Sil',
      `"${item.title}" kaydını silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAgendaItem(item.id);
              await loadData();
            } catch (e) {
              Alert.alert('Hata', 'Kayıt silinemedi.');
            }
          },
        },
      ]
    );
  };

  // Save (Create or Update)
  const handleSaveForm = async () => {
    if (!formTitle.trim()) {
      Alert.alert('Uyarı', 'Lütfen bir başlık giriniz.');
      return;
    }

    const y = formDate.getFullYear();
    const m = String(formDate.getMonth() + 1).padStart(2, '0');
    const d = String(formDate.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    let timeStr: string | null = null;
    if (formHasTime) {
      const hours = String(formTime.getHours()).padStart(2, '0');
      const minutes = String(formTime.getMinutes()).padStart(2, '0');
      timeStr = `${hours}:${minutes}`;
    }

    try {
      if (editingItem) {
        await updateAgendaItem(editingItem.id, {
          title: formTitle.trim(),
          description: formDescription.trim() || null,
          date: dateStr,
          has_time: formHasTime ? 1 : 0,
          time: timeStr,
          is_all_day_alert: formIsAllDayAlert ? 1 : 0,
          category: formCategory,
          priority: formPriority,
        });
      } else {
        await createAgendaItem({
          title: formTitle.trim(),
          description: formDescription.trim() || null,
          date: dateStr,
          has_time: formHasTime ? 1 : 0,
          time: timeStr,
          is_all_day_alert: formIsAllDayAlert ? 1 : 0,
          category: formCategory,
          priority: formPriority,
        });
      }

      setModalVisible(false);
      await loadData();
    } catch (e) {
      Alert.alert('Hata', 'Ajanda kaydı kaydedilirken bir sorun oluştu.');
    }
  };

  // Date picker handler
  const onDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selected) {
      setFormDate(selected);
    }
  };

  // Time picker handler
  const onTimeChange = (_: DateTimePickerEvent, selected?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selected) {
      setFormTime(selected);
    }
  };

  const activeCategoryConf = CATEGORIES.find((c) => c.key === formCategory) || CATEGORIES[0];
  const activePriorityConf = PRIORITIES.find((p) => p.key === formPriority) || PRIORITIES[0];

  return (
    <View style={[styles.container, { backgroundColor: bgTint || Colors.background }]}>
      <Header
        title="Ajanda & Hatırlatıcılar"
        subtitle={
          stats.todayPending > 0
            ? `Bugün ${stats.todayPending} bekleyen işiniz var`
            : stats.todayTotal > 0
            ? 'Bugünkü tüm işlerinizi tamamladınız! 🎉'
            : 'Planlarınızı ve görevlerinizi yönetin'
        }
        showBack={true}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity
            style={[styles.addBtnHeader, { backgroundColor: themeColor || Colors.primary }]}
            onPress={() => handleOpenAddModal(selectedDate)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.addBtnHeaderText}>Yeni Ekle</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* STATS OVERVIEW CARDS */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={[
              styles.statCard,
              selectedFilter === 'today' ? { borderColor: themeColor, borderWidth: 1.5 } : null,
            ]}
            onPress={() => setSelectedFilter(selectedFilter === 'today' ? 'all' : 'today')}
            activeOpacity={0.7}
          >
            <View style={[styles.statIconWrap, { backgroundColor: Colors.primaryLight }]}>
              <Ionicons name="today-outline" size={18} color={themeColor || Colors.primary} />
            </View>
            <View>
              <Text style={styles.statNumber}>{stats.todayTotal}</Text>
              <Text style={styles.statLabel}>Bugün</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statCard,
              selectedFilter === 'upcoming' ? { borderColor: themeColor, borderWidth: 1.5 } : null,
            ]}
            onPress={() => setSelectedFilter(selectedFilter === 'upcoming' ? 'all' : 'upcoming')}
            activeOpacity={0.7}
          >
            <View style={[styles.statIconWrap, { backgroundColor: Colors.warningLight }]}>
              <Ionicons name="time-outline" size={18} color={Colors.warningDark} />
            </View>
            <View>
              <Text style={styles.statNumber}>
                {items.filter((i) => i.date >= todayStr && i.is_completed === 0).length}
              </Text>
              <Text style={styles.statLabel}>Bekleyen</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statCard,
              selectedFilter === 'urgent' ? { borderColor: Colors.danger, borderWidth: 1.5 } : null,
            ]}
            onPress={() => setSelectedFilter(selectedFilter === 'urgent' ? 'all' : 'urgent')}
            activeOpacity={0.7}
          >
            <View style={[styles.statIconWrap, { backgroundColor: Colors.dangerLight }]}>
              <Ionicons name="flame" size={18} color={Colors.danger} />
            </View>
            <View>
              <Text style={[styles.statNumber, { color: Colors.danger }]}>{stats.urgentCount}</Text>
              <Text style={styles.statLabel}>Uyarı / Acil</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statCard,
              selectedFilter === 'completed' ? { borderColor: Colors.success, borderWidth: 1.5 } : null,
            ]}
            onPress={() => setSelectedFilter(selectedFilter === 'completed' ? 'all' : 'completed')}
            activeOpacity={0.7}
          >
            <View style={[styles.statIconWrap, { backgroundColor: Colors.successLight }]}>
              <Ionicons name="checkmark-done" size={18} color={Colors.successDark} />
            </View>
            <View>
              <Text style={[styles.statNumber, { color: Colors.successDark }]}>
                {items.filter((i) => i.is_completed === 1).length}
              </Text>
              <Text style={styles.statLabel}>Biten</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* INTERACTIVE DATE STRIP */}
        <Card style={styles.calendarStripCard}>
          <View style={styles.calendarHeaderRow}>
            <View style={styles.calendarTitleWrap}>
              <Ionicons name="calendar-outline" size={16} color={themeColor || Colors.primary} />
              <Text style={styles.calendarMonthText}>
                {formatDateToTR(selectedDate).split(' ')[0]}
                {selectedDate === todayStr ? ' (Bugün)' : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {selectedDate !== todayStr && (
                <TouchableOpacity
                  style={styles.todayJumpBtn}
                  onPress={() => setSelectedDate(todayStr)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.todayJumpText, { color: themeColor || Colors.primary }]}>Bugüne Git</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.quickAddDateBtn}
                onPress={() => handleOpenAddModal(selectedDate)}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateStripScroll}
          >
            {dateStripDays.map((item) => {
              const isSelected = item.dateStr === selectedDate;
              const hasItems = daysWithItemsMap[item.dateStr];
              const count = hasItems?.count || 0;
              const hasAlert = hasItems?.has_alert || false;

              return (
                <TouchableOpacity
                  key={item.dateStr}
                  style={[
                    styles.dayPill,
                    isSelected ? [styles.dayPillSelected, { backgroundColor: themeColor || Colors.primary }] : null,
                    item.isToday && !isSelected ? styles.dayPillToday : null,
                  ]}
                  onPress={() => {
                    setSelectedDate(item.dateStr);
                    if (selectedFilter !== 'all') setSelectedFilter('all');
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dayPillName,
                      isSelected ? styles.dayPillNameSelected : item.isToday ? { color: themeColor || Colors.primary } : null,
                    ]}
                  >
                    {item.dayName}
                  </Text>
                  <Text
                    style={[
                      styles.dayPillNum,
                      isSelected ? styles.dayPillNumSelected : item.isToday ? { color: themeColor || Colors.primary } : null,
                    ]}
                  >
                    {item.dayNum}
                  </Text>

                  {/* Activity Indicator Dots */}
                  <View style={styles.dayDotContainer}>
                    {hasAlert ? (
                      <View style={[styles.dayDot, { backgroundColor: isSelected ? '#FFFFFF' : Colors.danger }]} />
                    ) : count > 0 ? (
                      <View style={[styles.dayDot, { backgroundColor: isSelected ? '#FFFFFF' : themeColor || Colors.primary }]} />
                    ) : (
                      <View style={styles.dayDotPlaceholder} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Card>

        {/* CATEGORY FILTER CHIPS */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryChipsScroll}
        >
          <TouchableOpacity
            style={[
              styles.categoryChip,
              selectedCategory === 'all'
                ? [styles.categoryChipActive, { backgroundColor: themeColor || Colors.primary, borderColor: themeColor || Colors.primary }]
                : null,
            ]}
            onPress={() => setSelectedCategory('all')}
          >
            <Text
              style={[
                styles.categoryChipText,
                selectedCategory === 'all' ? styles.categoryChipTextActive : null,
              ]}
            >
              Tümü ({items.length})
            </Text>
          </TouchableOpacity>

          {CATEGORIES.map((c) => {
            const count = items.filter((i) => i.category === c.key).length;
            const isActive = selectedCategory === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                style={[
                  styles.categoryChip,
                  isActive
                    ? { backgroundColor: c.color, borderColor: c.color }
                    : null,
                ]}
                onPress={() => setSelectedCategory(isActive ? 'all' : c.key)}
              >
                <Ionicons
                  name={c.icon}
                  size={14}
                  color={isActive ? '#FFFFFF' : c.color}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    isActive ? styles.categoryChipTextActive : { color: Colors.textSecondary },
                  ]}
                >
                  {c.label} {count > 0 ? `(${count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* SECTION TITLE & RECORD COUNT */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>
            {selectedFilter === 'today'
              ? 'Bugünün Görevleri'
              : selectedFilter === 'upcoming'
              ? 'Yaklaşan İşler'
              : selectedFilter === 'urgent'
              ? 'Acil & Tüm Gün Uyarılar'
              : selectedFilter === 'completed'
              ? 'Tamamlanan İşler'
              : 'Tüm Ajanda Kayıtları'}
          </Text>
          <Text style={styles.sectionCountText}>{filteredItems.length} kayıt</Text>
        </View>

        {/* ITEMS LIST */}
        {filteredItems.length === 0 ? (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="calendar-outline" size={38} color={themeColor || Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Kayıtlı Görev Bulunmuyor</Text>
            <Text style={styles.emptySubtitle}>
              {selectedFilter === 'today'
                ? 'Bugün için planlanmış bir işiniz yok. Dinlenebilir veya yeni bir iş ekleyebilirsiniz.'
                : 'Bu filtreye uygun herhangi bir ajanda kaydı bulunamadı.'}
            </Text>
            <TouchableOpacity
              style={[styles.emptyActionBtn, { backgroundColor: themeColor || Colors.primary }]}
              onPress={() => handleOpenAddModal(selectedDate)}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle" size={18} color="#FFFFFF" />
              <Text style={styles.emptyActionBtnText}>Yeni Görev / Uyarı Ekle</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          filteredItems.map((item) => {
            const isCompleted = item.is_completed === 1;
            const catConf = CATEGORIES.find((c) => c.key === item.category) || CATEGORIES[0];
            const prioConf = PRIORITIES.find((p) => p.key === item.priority) || PRIORITIES[0];
            const isAlert = item.is_all_day_alert === 1;

            return (
              <Card
                key={item.id}
                style={[
                  styles.taskCard,
                  isAlert && !isCompleted ? styles.taskCardAlert : null,
                  isCompleted ? styles.taskCardCompleted : null,
                ]}
              >
                <View style={styles.taskCardContent}>
                  {/* Left: Checkbox */}
                  <TouchableOpacity
                    style={[
                      styles.checkboxTouch,
                      isCompleted ? styles.checkboxCompleted : styles.checkboxPending,
                      !isCompleted && item.priority === 'acil' ? { borderColor: Colors.danger } : null,
                    ]}
                    onPress={() => handleToggleCompleted(item)}
                    activeOpacity={0.7}
                  >
                    {isCompleted ? (
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    ) : null}
                  </TouchableOpacity>

                  {/* Middle: Details */}
                  <TouchableOpacity
                    style={styles.taskDetailsWrap}
                    onPress={() => handleOpenEditModal(item)}
                    activeOpacity={0.7}
                  >
                    {/* Badges Row */}
                    <View style={styles.taskBadgesRow}>
                      {/* Category Badge */}
                      <View style={[styles.miniBadge, { backgroundColor: catConf.bgColor }]}>
                        <Ionicons name={catConf.icon} size={11} color={catConf.color} />
                        <Text style={[styles.miniBadgeText, { color: catConf.color }]}>
                          {catConf.label}
                        </Text>
                      </View>

                      {/* Time or All-day badge */}
                      {item.has_time === 1 && item.time ? (
                        <View style={[styles.miniBadge, { backgroundColor: '#F1F5F9' }]}>
                          <Ionicons name="time-outline" size={11} color={Colors.textSecondary} />
                          <Text style={[styles.miniBadgeText, { color: Colors.textSecondary }]}>
                            {item.time}
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.miniBadge, { backgroundColor: '#F1F5F9' }]}>
                          <Ionicons name="sunny-outline" size={11} color={Colors.textMuted} />
                          <Text style={[styles.miniBadgeText, { color: Colors.textMuted }]}>
                            Tüm Gün
                          </Text>
                        </View>
                      )}

                      {/* All-day alert badge */}
                      {isAlert && !isCompleted && (
                        <View style={[styles.miniBadge, { backgroundColor: Colors.dangerLight }]}>
                          <Ionicons name="alert-circle" size={11} color={Colors.danger} />
                          <Text style={[styles.miniBadgeText, { color: Colors.danger, fontWeight: '700' }]}>
                            Ana Sayfa Uyarısı
                          </Text>
                        </View>
                      )}

                      {/* Priority if not normal */}
                      {item.priority !== 'normal' && (
                        <View style={[styles.miniBadge, { backgroundColor: prioConf.bgColor }]}>
                          <Ionicons name={prioConf.icon} size={11} color={prioConf.color} />
                          <Text style={[styles.miniBadgeText, { color: prioConf.color, fontWeight: '600' }]}>
                            {prioConf.label}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Title */}
                    <Text
                      style={[
                        styles.taskTitle,
                        isCompleted ? styles.taskTitleCompleted : null,
                      ]}
                      numberOfLines={2}
                    >
                      {item.title}
                    </Text>

                    {/* Description preview */}
                    {item.description ? (
                      <Text
                        style={[
                          styles.taskDescription,
                          isCompleted ? styles.taskDescCompleted : null,
                        ]}
                        numberOfLines={2}
                      >
                        {item.description}
                      </Text>
                    ) : null}

                    {/* Date subtitle */}
                    <View style={styles.taskDateRow}>
                      <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                      <Text style={styles.taskDateText}>
                        {formatDateToTR(item.date).split(' ')[0]}
                        {item.date === todayStr ? ' • Bugün' : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Right Actions */}
                  <View style={styles.taskActionsWrap}>
                    <TouchableOpacity
                      style={styles.taskActionBtn}
                      onPress={() => handleOpenEditModal(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="pencil-outline" size={16} color={Colors.textSecondary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.taskActionBtn, { marginTop: 8 }]}
                      onPress={() => handleDeleteItem(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            );
          })
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ADD / EDIT MODAL */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {editingItem ? 'Ajanda Kaydını Düzenle' : 'Yeni Ajanda Kaydı Ekle'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Yapılacak iş, toplantı veya hatırlatma kaydedin
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Title Input */}
              <Text style={styles.inputLabel}>
                Başlık <Text style={{ color: Colors.danger }}>*</Text>
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="Örn: 10-A Sınav kağıtlarını oku, Veli toplantısı..."
                placeholderTextColor={Colors.textMuted}
                value={formTitle}
                onChangeText={setFormTitle}
              />

              {/* Description Input */}
              <Text style={styles.inputLabel}>Açıklama / Not (Opsiyonel)</Text>
              <TextInput
                style={[styles.textInput, styles.textAreaInput]}
                placeholder="Detaylar, maddeler veya önemli notlar..."
                placeholderTextColor={Colors.textMuted}
                value={formDescription}
                onChangeText={setFormDescription}
                multiline={true}
                numberOfLines={3}
              />

              {/* Date Selector */}
              <Text style={styles.inputLabel}>Tarih</Text>
              <TouchableOpacity
                style={styles.selectorBtn}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={18} color={themeColor || Colors.primary} />
                <Text style={styles.selectorBtnText}>
                  {formatDateToTR(
                    `${formDate.getFullYear()}-${String(formDate.getMonth() + 1).padStart(2, '0')}-${String(
                      formDate.getDate()
                    ).padStart(2, '0')}`
                  ).split(' ')[0]}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker
                  value={formDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onDateChange}
                />
              )}

              {/* Has Time Switch & Time Selector */}
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Saat Belirle</Text>
                  <Text style={styles.switchSub}>
                    {formHasTime
                      ? 'Görevin belirli bir başlama saati var'
                      : 'Tüm gün geçerli (saatsiz)'}
                  </Text>
                </View>
                <Switch
                  value={formHasTime}
                  onValueChange={setFormHasTime}
                  trackColor={{ false: '#CBD5E1', true: (themeColor || Colors.primary) + '60' }}
                  thumbColor={formHasTime ? themeColor || Colors.primary : '#FFFFFF'}
                />
              </View>

              {formHasTime && (
                <TouchableOpacity
                  style={[styles.selectorBtn, { marginTop: 6 }]}
                  onPress={() => setShowTimePicker(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="time-outline" size={18} color={themeColor || Colors.primary} />
                  <Text style={styles.selectorBtnText}>
                    {String(formTime.getHours()).padStart(2, '0')}:
                    {String(formTime.getMinutes()).padStart(2, '0')}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}

              {showTimePicker && (
                <DateTimePicker
                  value={formTime}
                  mode="time"
                  is24Hour={true}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onTimeChange}
                />
              )}

              {/* ALL-DAY ALERT BANNER SWITCH (USER KEY REQUIREMENT) */}
              <View style={[styles.switchRow, styles.alertSwitchBox]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="alert-circle" size={18} color={Colors.danger} />
                    <Text style={[styles.switchTitle, { color: Colors.dangerDark }]}>
                      Tüm Gün Ekranda Uyarı Göster 🚨
                    </Text>
                  </View>
                  <Text style={styles.switchSub}>
                    Gözden kaçmaması için o gün boyunca Ana Sayfanın en üstünde dikkat çekici uyarı kartı olarak görünür.
                  </Text>
                </View>
                <Switch
                  value={formIsAllDayAlert}
                  onValueChange={setFormIsAllDayAlert}
                  trackColor={{ false: '#CBD5E1', true: Colors.dangerLight }}
                  thumbColor={formIsAllDayAlert ? Colors.danger : '#FFFFFF'}
                />
              </View>

              {/* Category Picker */}
              <Text style={styles.inputLabel}>Kategori / Tür</Text>
              <View style={styles.chipsWrap}>
                {CATEGORIES.map((c) => {
                  const isSelected = formCategory === c.key;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      style={[
                        styles.chipOption,
                        isSelected
                          ? { backgroundColor: c.color, borderColor: c.color }
                          : { backgroundColor: '#F8FAFC', borderColor: Colors.border },
                      ]}
                      onPress={() => setFormCategory(c.key)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={c.icon}
                        size={14}
                        color={isSelected ? '#FFFFFF' : c.color}
                      />
                      <Text
                        style={[
                          styles.chipOptionText,
                          isSelected ? { color: '#FFFFFF', fontWeight: '700' } : { color: Colors.textSecondary },
                        ]}
                      >
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Priority Picker */}
              <Text style={styles.inputLabel}>Öncelik Derecesi</Text>
              <View style={styles.priorityRow}>
                {PRIORITIES.map((p) => {
                  const isSelected = formPriority === p.key;
                  return (
                    <TouchableOpacity
                      key={p.key}
                      style={[
                        styles.priorityOption,
                        isSelected
                          ? { backgroundColor: p.bgColor, borderColor: p.color, borderWidth: 1.5 }
                          : { backgroundColor: '#F8FAFC', borderColor: Colors.border },
                      ]}
                      onPress={() => setFormPriority(p.key)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={p.icon} size={15} color={p.color} />
                      <Text
                        style={[
                          styles.priorityOptionText,
                          { color: isSelected ? p.color : Colors.textSecondary },
                          isSelected ? { fontWeight: '700' } : null,
                        ]}
                      >
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Modal Footer Buttons */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: themeColor || Colors.primary }]}
                onPress={handleSaveForm}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>
                  {editingItem ? 'Değişiklikleri Kaydet' : 'Ajandaya Ekle'}
                </Text>
              </TouchableOpacity>
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
  },
  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  addBtnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnHeaderText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.small,
  },
  statIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  calendarStripCard: {
    padding: 12,
    marginBottom: 14,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calendarTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calendarMonthText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  todayJumpBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.primaryLight,
    borderRadius: 6,
  },
  todayJumpText: {
    fontSize: 11,
    fontWeight: '700',
  },
  quickAddDateBtn: {
    backgroundColor: Colors.primary,
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateStripScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  dayPill: {
    width: 48,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dayPillToday: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  dayPillSelected: {
    borderWidth: 0,
    ...Shadows.small,
  },
  dayPillName: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  dayPillNameSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dayPillNum: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  dayPillNumSelected: {
    color: '#FFFFFF',
  },
  dayDotContainer: {
    marginTop: 4,
    height: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dayDotPlaceholder: {
    width: 5,
    height: 5,
  },
  categoryChipsScroll: {
    gap: 8,
    paddingBottom: 12,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryChipActive: {
    ...Shadows.small,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sectionCountText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    ...Shadows.small,
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  taskCard: {
    marginBottom: 10,
    padding: 12,
  },
  taskCardAlert: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.danger,
    backgroundColor: '#FFFDFD',
  },
  taskCardCompleted: {
    opacity: 0.65,
    backgroundColor: '#F8FAFC',
  },
  taskCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxTouch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxPending: {
    borderColor: Colors.divider,
    backgroundColor: '#FFFFFF',
  },
  checkboxCompleted: {
    borderColor: Colors.success,
    backgroundColor: Colors.success,
  },
  taskDetailsWrap: {
    flex: 1,
  },
  taskBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  miniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  miniBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 20,
    marginBottom: 4,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  taskDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginBottom: 6,
  },
  taskDescCompleted: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  taskDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  taskDateText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  taskActionsWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  taskActionBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingTop: 16,
    ...Shadows.large,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
    marginTop: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
    backgroundColor: '#F8FAFC',
  },
  textAreaInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#F8FAFC',
  },
  selectorBtnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginLeft: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingVertical: 6,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  switchSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  alertSwitchBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipOptionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  priorityOptionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    ...Shadows.small,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
