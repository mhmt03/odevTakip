import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, Shadows } from '../theme/colors';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  highlightBorder?: string;
}

export const Card: React.FC<CardProps> = ({ children, style, highlightBorder }) => {
  return (
    <View
      style={[
        styles.card,
        highlightBorder ? { borderLeftWidth: 4, borderLeftColor: highlightBorder } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
    ...Shadows.small,
  },
});
