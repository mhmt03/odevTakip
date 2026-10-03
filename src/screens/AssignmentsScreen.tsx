import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Modal,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors } from '../theme/colors';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Input } from '../components/Input';
import { EmptyState } from '../components/EmptyState';
import { getAssignments, deleteAssignment, updateAssignment } from '../database/operations/assignmentOperations';
import { getClasses } from '../database/operations/classOperations';
import { formatDateToTR } from '../utils/dateUtils';
import { Assignment, ClassItem } from '../types';
import { useSchoolTheme } from '../context/SchoolThemeContext';

export const AssignmentsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { bgTint } = useSchoolTheme();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const cls = await getClasses();
      setClasses(cls);
      const asg = await getAssignments(selectedClassId || undefined);
      setAssignments(asg);
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [selectedClassId])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Edit Modal State
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAssignedDate, setEditAssignedDate] = useState<Date>(new Date());
  const [editDueDate, setEditDueDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState<'assigned' | 'due' | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const handleEdit = (item: Assignment) => {
    setEditingAssignment(item);
    setEditTitle(item.title);
    setEditDescription(item.description || '');
    setEditAssignedDate(item.assigned_date ? new Date(item.assigned_date) : new Date());
    setEditDueDate(item.due_date ? new Date(item.due_date) : new Date());
  };

  const handleSaveEdit = async () => {
    if (!editingAssignment) return;
    if (!editTitle.trim()) {
      Alert.alert('Uyarı', 'Lütfen ödev konusunu boş bırakmayınız.');
      return;
    }
    try {
      setSavingEdit(true);
      const assignedDateStr = editAssignedDate.toISOString().split('T')[0];
      const dueDateStr = editDueDate.toISOString().split('T')[0];
      await updateAssignment(
        editingAssignment.id,
        editTitle.trim(),
        editDescription.trim(),
        assignedDateStr,
        dueDateStr
      );
      setEditingAssignment(null);
      loadData();
    } catch (e) {
      Alert.alert('Hata', 'Ödev güncellenirken bir hata oluştu.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = (item: Assignment) => {
    Alert.alert(
      'Ödevi Sil',
      `"${item.title}" ödevini ve tüm öğrenci sonuçlarını silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAssignment(item.id);
              loadData();
            } catch (e) {
              Alert.alert('Hata', 'Ödev silinemedi.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: bgTint }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Ödev Takip Modülü</Text>
          <Text style={styles.headerSub}>Toplam {assignments.length} ödev kayıtlı</Text>
        </View>
        <Button
          title="Ödev Ver"
          icon="add"
          size="sm"
          onPress={() => navigation.navigate('AssignmentCreate')}
        />
      </View>

      {/* Class Filter Scroll */}
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterChip, selectedClassId === null && styles.filterChipActive]}
            onPress={() => setSelectedClassId(null)}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedClassId === null && styles.filterChipTextActive,
              ]}
            >
              Tümü
            </Text>
          </TouchableOpacity>

          {classes.map((c) => {
            const isSelected = selectedClassId === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => setSelectedClassId(c.id)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextActive,
                  ]}
                >
                  {c.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={assignments}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            title="Ödev Bulunmuyor"
            description="Öğrencilerinize yeni bir konu ve teslim tarihi belirleyerek ödev atayın."
            actionTitle="Yeni Ödev Ver"
            onAction={() => navigation.navigate('AssignmentCreate')}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate('AssignmentDetail', {
                assignmentId: item.id,
              })
            }
          >
            <Card style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={styles.classBadge}>
                  <Text style={styles.classBadgeText}>{item.class_name || 'Şube'}</Text>
                </View>
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    onPress={() => handleEdit(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="pencil-outline" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.title}>{item.title}</Text>
              {item.description ? (
                <Text style={styles.description} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}

              <View style={styles.datesRow}>
                <View style={styles.dateItem}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.dateLabel}>Verilme: {formatDateToTR(item.assigned_date)}</Text>
                </View>
                <View style={styles.dateItem}>
                  <Ionicons name="time-outline" size={14} color={Colors.danger} />
                  <Text style={[styles.dateLabel, { color: Colors.danger }]}>
                    Teslim: {formatDateToTR(item.due_date)}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.progressRow}>
                <View style={styles.statusPill}>
                  <View style={[styles.dot, { backgroundColor: Colors.success }]} />
                  <Text style={styles.statusText}>{item.completed_count || 0} Yapıldı</Text>
                </View>
                <View style={styles.statusPill}>
                  <View style={[styles.dot, { backgroundColor: Colors.danger }]} />
                  <Text style={styles.statusText}>{item.missing_count || 0} Yapılmadı</Text>
                </View>
                <View style={styles.statusPill}>
                  <View style={[styles.dot, { backgroundColor: Colors.info }]} />
                  <Text style={styles.statusText}>{item.pending_count || 0} Bekliyor</Text>
                </View>
                <View style={styles.chevronWrap}>
                  <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />

      {/* Edit Modal */}
      <Modal
        visible={!!editingAssignment}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingAssignment(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ödevi Düzenle</Text>
              <TouchableOpacity onPress={() => setEditingAssignment(null)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBody}>
              <Input
                label="Ödev Konusu *"
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Ödev başlığı / konusu"
              />

              <Input
                label="Açıklama / Sayfalar"
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Örn: Ders kitabı sayfa 45-48"
                multiline
                numberOfLines={3}
                style={{ minHeight: 70 }}
              />

              <View style={styles.datesRowModal}>
                <View style={styles.dateColModal}>
                  <Text style={styles.inputLabelModal}>Verilme Tarihi</Text>
                  <TouchableOpacity
                    style={styles.datePickerBtnModal}
                    onPress={() => setShowDatePicker('assigned')}
                  >
                    <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                    <Text style={styles.datePickerTextModal}>
                      {formatDateToTR(editAssignedDate.toISOString().split('T')[0])}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.dateColModal}>
                  <Text style={styles.inputLabelModal}>Teslim Tarihi</Text>
                  <TouchableOpacity
                    style={styles.datePickerBtnModal}
                    onPress={() => setShowDatePicker('due')}
                  >
                    <Ionicons name="calendar-outline" size={16} color={Colors.danger} />
                    <Text style={styles.datePickerTextModal}>
                      {formatDateToTR(editDueDate.toISOString().split('T')[0])}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={showDatePicker === 'assigned' ? editAssignedDate : editDueDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    const currentPicker = showDatePicker;
                    setShowDatePicker(null);
                    if (selectedDate) {
                      if (currentPicker === 'assigned') setEditAssignedDate(selectedDate);
                      else setEditDueDate(selectedDate);
                    }
                  }}
                />
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button
                title="İptal"
                variant="outline"
                onPress={() => setEditingAssignment(null)}
                style={{ flex: 1 }}
              />
              <Button
                title="Kaydet"
                loading={savingEdit}
                onPress={handleSaveEdit}
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
  filterWrap: {
    backgroundColor: Colors.card,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.textInverse,
  },
  listContent: {
    padding: 16,
  },
  card: {
    padding: 14,
    marginBottom: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  classBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  classBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  datesRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  dateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chevronWrap: {
    marginLeft: 'auto',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
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
  modalBody: {
    marginBottom: 16,
  },
  datesRowModal: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 10,
  },
  dateColModal: {
    flex: 1,
  },
  inputLabelModal: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  datePickerBtnModal: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
    gap: 6,
  },
  datePickerTextModal: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
  },
});
