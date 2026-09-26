import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { AssignmentStatus } from '../types';

interface BadgeProps {
  status?: AssignmentStatus | string;
  label?: string;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ status, label, size = 'md' }) => {
  let bg = Colors.cardSubtle;
  let text = Colors.textSecondary;
  let displayLabel = label || status || '';

  if (status === 'yapildi') {
    bg = Colors.successLight;
    text = Colors.successDark;
    displayLabel = label || 'Yapıldı';
  } else if (status === 'yapilmadi') {
    bg = Colors.dangerLight;
    text = Colors.dangerDark;
    displayLabel = label || 'Yapılmadı';
  } else if (status === 'eksik') {
    bg = Colors.warningLight;
    text = Colors.warningDark;
    displayLabel = label || 'Eksik';
  } else if (status === 'muaf') {
    bg = '#E2E8F0';
    text = '#475569';
    displayLabel = label || 'Muaf';
  } else if (status === 'bekliyor') {
    bg = Colors.infoLight;
    text = Colors.info;
    displayLabel = label || 'Bekliyor';
  }

  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: bg },
        isSmall && styles.badgeSm,
      ]}
    >
      <Text style={[styles.text, { color: text }, isSmall && styles.textSm]}>
        {displayLabel}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
  textSm: {
    fontSize: 10,
    fontWeight: '600',
  },
});
