import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme, spacing, radius, shadows } from '@/lib/theme';

interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'muted';
  style?: StyleProp<ViewStyle>;
  padding?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export default function Card({
  children,
  variant = 'default',
  style,
  padding = 'lg',
}: CardProps) {
  const theme = useTheme();

  const paddingMap = {
    xs: spacing.xs,
    sm: spacing.sm,
    md: spacing.md,
    lg: spacing.lg,
    xl: spacing.xl,
  };

  const backgroundColor = variant === 'muted' ? theme.panel2 : theme.panel;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor,
          borderColor: theme.border,
          padding: paddingMap[padding],
          borderRadius: radius.lg,
        },
        shadows.md,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
});
