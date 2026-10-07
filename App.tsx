import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, StatusBar, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { initDatabase } from './src/database/db';
import { activateDefaultSchoolOnStartup } from './src/database/operations/schoolOperations';
import { Colors } from './src/theme/colors';

import { SchoolThemeProvider, useSchoolTheme } from './src/context/SchoolThemeContext';

// Screens
import { HomeScreen } from './src/screens/HomeScreen';
import { ClassesScreen } from './src/screens/ClassesScreen';
import { ClassDetailScreen } from './src/screens/ClassDetailScreen';
import { AssignmentsScreen } from './src/screens/AssignmentsScreen';
import { AssignmentCreateScreen } from './src/screens/AssignmentCreateScreen';
import { AssignmentDetailScreen } from './src/screens/AssignmentDetailScreen';
import { StudentNotesScreen } from './src/screens/StudentNotesScreen';
import { ScheduleScreen } from './src/screens/ScheduleScreen';
import { ScheduleManageScreen } from './src/screens/ScheduleManageScreen';
import { YearlyPlanScreen } from './src/screens/YearlyPlanScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { OperationsScreen } from './src/screens/OperationsScreen';
import { AgendaScreen } from './src/screens/AgendaScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  const { themeColor, bgTint } = useSchoolTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom + 12, Platform.OS === 'android' ? 28 : 20);
  const tabHeight = 60 + bottomInset;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: bgTint },
        tabBarActiveTintColor: themeColor,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: bgTint,
          borderTopWidth: 1,
          borderTopColor: `${themeColor}25`,
          height: tabHeight,
          paddingBottom: bottomInset,
          paddingTop: 6,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarItemStyle: {
          backgroundColor: 'transparent',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Anasayfa',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ClassesTab"
        component={ClassesScreen}
        options={{
          tabBarLabel: 'Şubeler',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'school' : 'school-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AssignmentsTab"
        component={AssignmentsScreen}
        options={{
          tabBarLabel: 'Ödevler',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'document-text' : 'document-text-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="StudentNotesTab"
        component={StudentNotesScreen}
        options={{
          tabBarLabel: 'Görüşler',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="ScheduleTab"
        component={ScheduleScreen}
        options={{
          tabBarLabel: 'Program',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="ReportsTab"
        component={ReportsScreen}
        options={{
          tabBarLabel: 'Raporlar',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'stats-chart' : 'stats-chart-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  const prepare = async () => {
    setDbError(null);
    try {
      await initDatabase();
      try {
        await activateDefaultSchoolOnStartup();
      } catch (err) {
        console.warn('Default school activation failed:', err);
      }
      setDbReady(true);
    } catch (e: any) {
      console.error('Failed to initialize database:', e);
      setDbError(String(e?.message || e));
    }
  };

  useEffect(() => {
    prepare();
  }, []);

  if (dbError) {
    const locked = dbError.includes('locked');
    return (
      <View style={styles.splashContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
        <Text style={styles.splashText}>Veritabanı açılamadı</Text>
        <Text style={styles.errorText}>
          {locked
            ? 'Veritabanı başka bir işlem tarafından kilitli. Uygulamayı tamamen kapatıp (Durmaya zorla) yeniden açın.'
            : dbError}
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={prepare} testID="db-retry-btn">
          <Text style={styles.retryText}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!dbReady) {
    return (
      <View style={styles.splashContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.splashText}>Sınıf Takip Başlatılıyor...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SchoolThemeProvider>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent={true} />
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Colors.background },
            }}
          >
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="StudentNotesTab" component={StudentNotesScreen} />
            <Stack.Screen name="ClassDetail" component={ClassDetailScreen} />
            <Stack.Screen name="AssignmentCreate" component={AssignmentCreateScreen} />
            <Stack.Screen name="AssignmentDetail" component={AssignmentDetailScreen} />
            <Stack.Screen name="ScheduleManage" component={ScheduleManageScreen} />
            <Stack.Screen name="YearlyPlan" component={YearlyPlanScreen} />
            <Stack.Screen name="Operations" component={OperationsScreen} />
            <Stack.Screen name="Agenda" component={AgendaScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SchoolThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashText: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  errorText: {
    marginTop: 8,
    marginHorizontal: 32,
    fontSize: 13,
    textAlign: 'center',
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  retryBtn: {
    marginTop: 18,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
