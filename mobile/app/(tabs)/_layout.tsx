import React from 'react';
import { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { useTheme } from '@/lib/theme';
import {
  Heart,
  MessageCircle,
  Upload,
  Watch,
  User,
} from 'lucide-react-native';
import { useWindowDimensions } from 'react-native';

export default function TabsLayout() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const screenOptions: BottomTabNavigationOptions = {
    headerShown: false,
    tabBarActiveTintColor: theme.accent,
    tabBarInactiveTintColor: theme.muted,
    tabBarStyle: {
      backgroundColor: theme.panel,
      borderTopColor: theme.border,
      borderTopWidth: 1,
      paddingBottom: 4,
      height: 60,
    },
    tabBarLabelStyle: {
      fontSize: 12,
      fontFamily: 'space-grotesk',
      marginTop: -6,
    },
  };

  return (
    <Tabs
      screenOptions={screenOptions}
      sceneContainerStyle={{ backgroundColor: theme.bg }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Heart color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <MessageCircle color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: 'Upload',
          tabBarIcon: ({ color, size }) => (
            <Upload color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="wearables"
        options={{
          title: 'Wearables',
          tabBarIcon: ({ color, size }) => (
            <Watch color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <User color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
    </Tabs>
  );
}
