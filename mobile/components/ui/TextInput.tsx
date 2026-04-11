import React from 'react';
import {
  TextInput as RNTextInput,
  StyleSheet,
  View,
  StyleProp,
  ViewStyle,
  TextInputProps,
} from 'react-native';
import { useTheme, spacing, radius } from '@/lib/theme';

interface CustomTextInputProps extends TextInputProps {
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'ghost';
}

export default function TextInput({
  style,
  variant = 'default',
  placeholderTextColor,
  ...props
}: CustomTextInputProps) {
  const theme = useTheme();

  const variants = {
    default: {
      backgroundColor: theme.panel2,
      borderColor: theme.border,
      borderWidth: 1,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderColor: theme.border,
      borderWidth: 0,
      borderBottomWidth: 1,
    },
  };

  return (
    <View
      style={[
        styles.container,
        variants[variant],
        {
          borderRadius: radius.md,
        },
        style,
      ]}
    >
      <RNTextInput
        style={[
          styles.input,
          {
            color: theme.fg,
          },
        ]}
        placeholderTextColor={placeholderTextColor || theme.muted}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    height: 48,
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'space-grotesk',
  },
});
