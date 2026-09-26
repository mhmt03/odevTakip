import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
  TextStyle,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  style,
  textStyle,
}) => {
  const getContainerStyle = (): ViewStyle => {
    switch (variant) {
      case 'secondary':
        return { backgroundColor: Colors.secondaryLight };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: Colors.primary,
        };
      case 'danger':
        return { backgroundColor: Colors.danger };
      case 'success':
        return { backgroundColor: Colors.success };
      case 'primary':
      default:
        return { backgroundColor: Colors.primary };
    }
  };

  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case 'secondary':
        return { color: Colors.secondary };
      case 'outline':
        return { color: Colors.primary };
      case 'danger':
      case 'success':
      case 'primary':
      default:
        return { color: Colors.textInverse };
    }
  };

  const getSizeStyle = (): ViewStyle => {
    switch (size) {
      case 'sm':
        return { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 };
      case 'lg':
        return { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12 };
      case 'md':
      default:
        return { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 };
    }
  };

  const getIconColor = (): string => {
    if (variant === 'outline') return Colors.primary;
    if (variant === 'secondary') return Colors.secondary;
    return Colors.textInverse;
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        getContainerStyle(),
        getSizeStyle(),
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator size="small" color={getIconColor()} />
      ) : (
        <View style={styles.content}>
          {icon && (
            <Ionicons
              name={icon}
              size={size === 'sm' ? 16 : 18}
              color={getIconColor()}
              style={styles.icon}
            />
          )}
          <Text
            style={[
              styles.text,
              getTextStyle(),
              size === 'sm' && styles.textSm,
              textStyle,
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: 6,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  textSm: {
    fontSize: 13,
  },
  disabled: {
    opacity: 0.5,
  },
});
