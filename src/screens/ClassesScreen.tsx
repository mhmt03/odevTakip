import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { EmptyState } from '../components/EmptyState';
import {
  getClasses,
  createClass,
  updateClass,
  deleteClass,
} from '../database/operations/classOperations';
import { ClassItem } from '../types';

export const ClassesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [classNameInput, setClassNameInput] = useState('');
  const [classDescInput, setClassDescInput] = useState('');

  const loadClasses = async () => {
    try {
      const data = await getClasses();
      setClasses(data);
    } catch (error) {
      console.error('Error loading classes:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadClasses();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadClasses();
    setRefreshing(false);
  };

  const handleOpenAdd = () => {
    setEditingClass(null);
    setClassNameInput('');
    setClassDescInput('');
    setModalVisible(true);
  };

  const handleOpenEdit = (c: ClassItem) => {
    setEditingClass(c);
    setClassNameInput(c.name);
    setClassDescInput(c.description || '');
    setModalVisible(true);
  };

  const handleSaveClass = async () => {
    if (!classNameInput.trim()) {
      Alert.alert('Uyarı', 'Lütfen şube adı giriniz (Örn: 12-A).');
      return;
    }

    try {
      if (editingClass) {
        await updateClass(editingClass.id, classNameInput, classDescInput);
      } else {
        await createClass(classNameInput, classDescInput);
      }
      setModalVisible(false);
      loadClasses();
    } catch (error: any) {
      Alert.alert('Hata', 'Bu şube adı zaten mevcut olabilir veya bir hata oluştu.');
    }
  };

  const handleDeleteClass = (c: ClassItem) => {
    Alert.alert(
      'Şubeyi Sil',
      `"${c.name}" şubesini ve bu şubeye ait tüm öğrenci, ödev ve kayıtları silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteClass(c.id);
              loadClasses();
            } catch (error) {
              Alert.alert('Hata', 'Şube silinirken bir sorun oluştu.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Okul Şubeleri</Text>
          <Text style={styles.headerSub}>Toplam {classes.length} şube kayıtlı</Text>
        </View>
        <Button
          title="Şube Ekle"
          icon="add"
          size="sm"
          onPress={handleOpenAdd}
        />
      </View>

      <FlatList
        data={classes}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState
            icon="school-outline"
            title="Henüz Şube Eklenmemiş"
            description="Öğrencilerinizi ve derslerinizi takip etmek için ilk şubenizi ekleyin."
            actionTitle="Yeni Şube Ekle"
            onAction={handleOpenAdd}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate('ClassDetail', {
                classId: item.id,
                className: item.name,
              })
            }
          >
            <Card style={styles.classCard}>
              <View style={styles.classRow}>
                <View style={styles.classIconWrap}>
                  <Text style={styles.classAvatarText}>{item.name.substring(0, 3)}</Text>
                </View>

                <View style={styles.classInfo}>
                  <Text style={styles.className}>{item.name}</Text>
                  {item.description ? (
                    <Text style={styles.classDesc} numberOfLines={1}>
                      {item.description}
                    </Text>
                  ) : null}
                  <View style={styles.studentBadge}>
                    <Ionicons name="people" size={13} color={Colors.primary} />
                    <Text style={styles.studentCount}>
                      {item.student_count || 0} Öğrenci
                    </Text>
                  </View>
                </View>

                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => handleOpenEdit(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="pencil" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => handleDeleteClass(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                  </TouchableOpacity>

                  <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />

      {/* Add / Edit Class Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingClass ? 'Şubeyi Düzenle' : 'Yeni Şube Ekle'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Input
              label="Şube Adı *"
              placeholder="Örn: 12-A, 10-B, 9-C"
              value={classNameInput}
              onChangeText={setClassNameInput}
              autoCapitalize="characters"
            />

            <Input
              label="Açıklama (Opsiyonel)"
              placeholder="Örn: Sayısal, Rehberlik Sınıfım vb."
              value={classDescInput}
              onChangeText={setClassDescInput}
            />

            <View style={styles.modalActions}>
              <Button
                title="Vazgeç"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setModalVisible(false)}
              />
              <Button
                title={editingClass ? 'Güncelle' : 'Kaydet'}
                style={{ flex: 1 }}
                onPress={handleSaveClass}
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
  listContent: {
    padding: 16,
  },
  classCard: {
    padding: 14,
    marginBottom: 10,
  },
  classRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  classIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  classAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primary,
  },
  classInfo: {
    flex: 1,
  },
  className: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  classDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  studentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  studentCount: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: Colors.cardSubtle,
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
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
});
