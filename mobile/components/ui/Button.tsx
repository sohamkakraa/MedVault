import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useTheme, spacing, radius } from '@/lib/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  size = 'md',
  style,
}: ButtonProps) {
  const theme = useTheme();

  const buttonStyles = {
    primary: {
      backgroundColor: theme.accent,
      borderWidth: 0,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderWidth: 0,
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.accent,
    },
  };

  const textColors = {
    primary: theme.fg === '#151515' ? '#ffffff' : theme.bg,
    ghost: theme.accent,
    outline: theme.accent,
  };

  const paddingMap = {
    sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
    md: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
    lg: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xl },
  };

  const fontSizeMap = {
    sm: 14,
    md: 16,
    lg: 18,
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        styles.button,
        buttonStyles[variant],
        paddingMap[size],
        {
          opacity: disabled || loading ? 0.5 : 1,
          borderRadius: radius.lg,
        },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading && <ActivityIndicator color={textColors[variant]} style={styles.spinner} />}
        <Text
          style={[
            styles.text,
            {
              color: textColors[variant],
              fontSize: fontSizeMap[size],
              marginLeft: loading ? spacing.sm : 0,
            },
          ]}
        >
          {title}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '600',
    fontFamily: 'space-grotesk',
  },
  spinner: {
    marginRight: spacing.sm,
  },
});
