import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  useWindowDimensions,
  Switch,
  Alert,
} from 'react-native';
import { useTheme, spacing, radius } from '@/lib/theme';
import { useAuthStore } from '@/lib/auth';
import { useThemeStore } from '@/lib/theme';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import TextInput from '@/components/ui/TextInput';
import { User, Lock, Moon, Download, Trash2, LogOut, Info } from 'lucide-react-native';
import { router } from 'expo-router';

interface ProfileFormData {
  name: string;
  email: string;
  dob: string;
  phone: string;
  primaryCareProvider: string;
}

export default function ProfileScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const themeMode = useThemeStore((s) => s.mode);
  const setTheme = useThemeStore((s) => s.setMode);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>({
    name: 'Jane Doe',
    email: user?.email || 'jane@example.com',
    dob: '1990-05-15',
    phone: '+1 (555) 123-4567',
    primaryCareProvider: 'Dr. Sarah Johnson',
  });
  const isTablet = width >= 768;

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
        style: 'destructive',
      },
    ]);
  };

  const handleDeleteData = () => {
    Alert.alert('Delete All Data', 'This action cannot be undone. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        onPress: () => {
          Alert.alert('Data Deleted', 'All your data has been removed.');
        },
        style: 'destructive',
      },
    ]);
  };

  const handleExportData = () => {
    Alert.alert('Export Data', 'Your data export is being prepared. Check your email soon.');
  };

  const contentWidth = isTablet ? '60%' : '100%';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.fg }]}>Profile</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            Manage your account and preferences
          </Text>
        </View>

        {/* Profile Avatar */}
        <View style={[styles.avatarSection, { width: contentWidth }]}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: theme.accent + '20',
                borderColor: theme.accent,
              },
            ]}
          >
            <User size={32} color={theme.accent} />
          </View>
          <Text style={[styles.avatarName, { color: theme.fg, marginTop: spacing.lg }]}>
            {formData.name}
          </Text>
          <Text style={[styles.avatarEmail, { color: theme.muted }]}>{formData.email}</Text>
        </View>

        {/* Personal Information Section */}
        <Card
          style={[styles.section, { width: contentWidth, marginTop: spacing.xl }]}
          padding="lg"
        >
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.fg }]}>Personal Information</Text>
            {!isEditing && (
              <Button
                title="Edit"
                variant="ghost"
                size="sm"
                onPress={() => setIsEditing(true)}
              />
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.fg }]}>Full Name</Text>
            <TextInput
              placeholder="Full name"
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              editable={isEditing}
              placeholderTextColor={theme.muted}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.fg }]}>Email</Text>
            <TextInput
              placeholder="Email"
              value={formData.email}
              onChangeText={(text) => setFormData({ ...formData, email: text })}
              editable={isEditing}
              placeholderTextColor={theme.muted}
              keyboardType="email-address"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.fg }]}>Date of Birth</Text>
            <TextInput
              placeholder="YYYY-MM-DD"
              value={formData.dob}
              onChangeText={(text) => setFormData({ ...formData, dob: text })}
              editable={isEditing}
              placeholderTextColor={theme.muted}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.fg }]}>Phone</Text>
            <TextInput
              placeholder="Phone number"
              value={formData.phone}
              onChangeText={(text) => setFormData({ ...formData, phone: text })}
              editable={isEditing}
              placeholderTextColor={theme.muted}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.fg }]}>Primary Care Provider</Text>
            <TextInput
              placeholder="Doctor name"
              value={formData.primaryCareProvider}
              onChangeText={(text) => setFormData({ ...formData, primaryCareProvider: text })}
              editable={isEditing}
              placeholderTextColor={theme.muted}
            />
          </View>

          {isEditing && (
            <View style={styles.buttonGroup}>
              <Button
                title="Save Changes"
                onPress={() => setIsEditing(false)}
                style={{ marginBottom: spacing.md }}
              />
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setIsEditing(false)}
              />
            </View>
          )}
        </Card>

        {/* Preferences Section */}
        <Card
          style={[styles.section, { width: contentWidth, marginTop: spacing.lg }]}
          padding="lg"
        >
          <Text style={[styles.sectionTitle, { color: theme.fg, marginBottom: spacing.lg }]}>
            Preferences
          </Text>

          <View style={[styles.settingRow, { borderBottomColor: theme.border }]}>
            <View style={styles.settingContent}>
              <Moon size={20} color={theme.accent} />
              <View style={{ marginLeft: spacing.md, flex: 1 }}>
                <Text style={[styles.settingLabel, { color: theme.fg }]}>Theme</Text>
                <Text style={[styles.settingValue, { color: theme.muted }]}>
                  {themeMode === 'system' ? 'System' : themeMode === 'dark' ? 'Dark' : 'Light'}
                </Text>
              </View>
            </View>

            <View style={styles.settingControl}>
              {themeMode !== 'light' && (
                <Button
                  title="Light"
                  variant="ghost"
                  size="sm"
                  onPress={() => setTheme('light')}
                />
              )}
              {themeMode !== 'dark' && (
                <Button
                  title="Dark"
                  variant="ghost"
                  size="sm"
                  onPress={() => setTheme('dark')}
                />
              )}
              {themeMode !== 'system' && (
                <Button
                  title="System"
                  variant="ghost"
                  size="sm"
                  onPress={() => setTheme('system')}
                />
              )}
            </View>
          </View>
        </Card>

        {/* Security Section */}
        <Card
          style={[styles.section, { width: contentWidth, marginTop: spacing.lg }]}
          padding="lg"
        >
          <Text style={[styles.sectionTitle, { color: theme.fg, marginBottom: spacing.lg }]}>
            Security
          </Text>

          <View style={[styles.settingRow, { borderBottomColor: theme.border }]}>
            <Lock size={20} color={theme.accent2} />
            <View style={{ marginLeft: spacing.md, flex: 1 }}>
              <Text style={[styles.settingLabel, { color: theme.fg }]}>Encryption</Text>
              <Text style={[styles.settingValue, { color: theme.muted }]}>
                End-to-end encrypted
              </Text>
            </View>
            <View
              style={[
                styles.securityBadge,
                {
                  backgroundColor: theme.success + '20',
                },
              ]}
            >
              <Text style={[styles.badgeText, { color: theme.success }]}>On</Text>
            </View>
          </View>
        </Card>

        {/* Data Management */}
        <Card
          style={[styles.section, { width: contentWidth, marginTop: spacing.lg }]}
          padding="lg"
        >
          <Text style={[styles.sectionTitle, { color: theme.fg, marginBottom: spacing.lg }]}>
            Data Management
          </Text>

          <Button
            title="Export My Data"
            variant="outline"
            onPress={handleExportData}
            style={{ marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center' }}
          />

          <Button
            title="Delete All Data"
            variant="outline"
            onPress={handleDeleteData}
            style={{
              marginBottom: spacing.md,
              borderColor: theme.error,
            }}
          />
        </Card>

        {/* App Info */}
        <Card
          variant="muted"
          style={[styles.section, { width: contentWidth, marginTop: spacing.lg }]}
          padding="md"
        >
          <View style={styles.infoRow}>
            <Info size={16} color={theme.accent} />
            <View style={{ marginLeft: spacing.md, flex: 1 }}>
              <Text style={[styles.infoLabel, { color: theme.fg }]}>App Version</Text>
              <Text style={[styles.infoValue, { color: theme.muted }]}>1.0.0</Text>
            </View>
          </View>
        </Card>

        {/* Disclaimer */}
        <View style={[styles.disclaimer, { width: contentWidth }]}>
          <Text style={[styles.disclaimerTitle, { color: theme.fg, marginBottom: spacing.md }]}>
            Important Notice
          </Text>
          <Text style={[styles.disclaimerText, { color: theme.muted }]}>
            UMA is a health information tool for personal use only. It is not medical advice and
            should not be used for diagnosis or treatment. Always consult with qualified healthcare
            professionals for medical concerns.
          </Text>
        </View>

        {/* Sign Out Button */}
        <Button
          title="Sign Out"
          variant="outline"
          onPress={handleLogout}
          style={{
            marginTop: spacing.xl,
            marginBottom: spacing.xxxl,
            width: contentWidth,
            borderColor: theme.error,
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'fraunces-bold',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'space-grotesk',
    lineHeight: 20,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  avatarName: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'space-grotesk',
  },
  avatarEmail: {
    fontSize: 12,
    fontFamily: 'space-grotesk',
  },
  section: {
    width: '100%',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'space-grotesk',
  },
  formGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'space-grotesk',
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  buttonGroup: {
    marginTop: spacing.lg,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'space-grotesk',
  },
  settingValue: {
    fontSize: 12,
    fontFamily: 'space-grotesk',
    marginTop: spacing.xs,
  },
  settingControl: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  securityBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'space-grotesk',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'space-grotesk',
  },
  infoValue: {
    fontSize: 12,
    fontFamily: 'space-grotesk',
    marginTop: spacing.xs,
  },
  disclaimer: {
    marginTop: spacing.xl,
  },
  disclaimerTitle: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'space-grotesk',
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'space-grotesk',
  },
});
