import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { initDatabase } from './src/database/db';
import { Colors } from './src/theme/colors';

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

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.card,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
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

  useEffect(() => {
    async function prepare() {
      try {
        await initDatabase();
        setDbReady(true);
      } catch (e) {
        console.error('Failed to initialize database:', e);
        setDbReady(true); // Proceed anyway
      }
    }
    prepare();
  }, []);

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
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
          }}
        >
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="ClassDetail" component={ClassDetailScreen} />
          <Stack.Screen name="AssignmentCreate" component={AssignmentCreateScreen} />
          <Stack.Screen name="AssignmentDetail" component={AssignmentDetailScreen} />
          <Stack.Screen name="ScheduleManage" component={ScheduleManageScreen} />
          <Stack.Screen name="YearlyPlan" component={YearlyPlanScreen} />
        </Stack.Navigator>
      </NavigationContainer>
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
});
