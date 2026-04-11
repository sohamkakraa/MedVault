import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
  FlatList,
} from 'react-native';
import { useTheme, spacing, radius, typography } from '@/lib/theme';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Heart, Calendar, Pill, Activity, TrendingUp } from 'lucide-react-native';

interface ProfileData {
  name: string;
  conditions: string[];
  allergies: string[];
  nextVisit?: string;
}

interface MedicationItem {
  name: string;
  dose: string;
  frequency: string;
}

interface LabValue {
  name: string;
  value: string;
  unit: string;
  date: string;
}

export default function DashboardScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);
  const isTablet = width >= 768;

  const profileData: ProfileData = {
    name: 'Jane Doe',
    conditions: ['Type 2 Diabetes', 'Hypertension'],
    allergies: ['Penicillin', 'Shellfish'],
    nextVisit: '2026-04-18',
  };

  const medications: MedicationItem[] = [
    { name: 'Metformin', dose: '500mg', frequency: 'Twice daily' },
    { name: 'Lisinopril', dose: '10mg', frequency: 'Once daily' },
    { name: 'Atorvastatin', dose: '20mg', frequency: 'Once daily' },
  ];

  const recentLabs: LabValue[] = [
    { name: 'HbA1c', value: '6.8', unit: '%', date: '2026-04-05' },
    { name: 'LDL Cholesterol', value: '108', unit: 'mg/dL', date: '2026-04-05' },
    { name: 'Blood Pressure', value: '128/82', unit: 'mmHg', date: '2026-04-05' },
  ];

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const contentWidth = isTablet ? '48%' : '100%';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: spacing.lg }]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.greeting, { color: theme.fg }]}>Good morning,</Text>
          <Text style={[styles.name, { color: theme.fg }]}>{profileData.name}</Text>
        </View>

        {/* Quick Profile Snapshot */}
        <Card style={[styles.profileCard, { width: contentWidth }]} padding="md">
          <View style={styles.profileContent}>
            <View style={styles.profileSection}>
              <Text style={[styles.profileLabel, { color: theme.muted }]}>Conditions</Text>
              <View style={styles.tagList}>
                {profileData.conditions.map((condition, i) => (
                  <View
                    key={i}
                    style={[
                      styles.tag,
                      {
                        backgroundColor: theme.accent + '20',
                        borderColor: theme.accent,
                      },
                    ]}
                  >
                    <Text style={[styles.tagText, { color: theme.accent }]}>{condition}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.profileSection}>
              <Text style={[styles.profileLabel, { color: theme.muted }]}>Allergies</Text>
              <View style={styles.tagList}>
                {profileData.allergies.map((allergy, i) => (
                  <View
                    key={i}
                    style={[
                      styles.tag,
                      {
                        backgroundColor: theme.error + '20',
                        borderColor: theme.error,
                      },
                    ]}
                  >
                    <Text style={[styles.tagText, { color: theme.error }]}>{allergy}</Text>
                  </View>
                ))}
              </View>
            </View>

            {profileData.nextVisit && (
              <View style={[styles.nextVisitRow, { borderTopColor: theme.border }]}>
                <Calendar size={16} color={theme.accent} />
                <Text style={[styles.nextVisitText, { color: theme.muted, marginLeft: spacing.md }]}>
                  Next visit: {new Date(profileData.nextVisit).toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>
        </Card>

        {/* Health Trends */}
        <Card style={[styles.sectionCard, { width: contentWidth }]} padding="md">
          <View style={styles.sectionHeader}>
            <TrendingUp size={20} color={theme.accent} />
            <Text style={[styles.sectionTitle, { color: theme.fg, marginLeft: spacing.md }]}>
              Recent Lab Values
            </Text>
          </View>
          {recentLabs.map((lab, i) => (
            <View
              key={i}
              style={[
                styles.labRow,
                {
                  borderBottomColor: theme.border,
                  borderBottomWidth: i < recentLabs.length - 1 ? 1 : 0,
                },
              ]}
            >
              <View>
                <Text style={[styles.labName, { color: theme.fg }]}>{lab.name}</Text>
                <Text style={[styles.labDate, { color: theme.muted }]}>{lab.date}</Text>
              </View>
              <Text style={[styles.labValue, { color: theme.accent }]}>
                {lab.value} {lab.unit}
              </Text>
            </View>
          ))}
        </Card>

        {/* Active Medications */}
        <Card style={[styles.sectionCard, { width: contentWidth }]} padding="md">
          <View style={styles.sectionHeader}>
            <Pill size={20} color={theme.accent2} />
            <Text style={[styles.sectionTitle, { color: theme.fg, marginLeft: spacing.md }]}>
              Active Medications
            </Text>
          </View>
          {medications.map((med, i) => (
            <View
              key={i}
              style={[
                styles.medRow,
                {
                  borderBottomColor: theme.border,
                  borderBottomWidth: i < medications.length - 1 ? 1 : 0,
                },
              ]}
            >
              <View>
                <Text style={[styles.medName, { color: theme.fg }]}>{med.name}</Text>
                <Text style={[styles.medDetails, { color: theme.muted }]}>
                  {med.dose} • {med.frequency}
                </Text>
              </View>
            </View>
          ))}
        </Card>

        {/* Wearable Summary */}
        <Card style={[styles.sectionCard, { width: contentWidth }]} padding="md">
          <View style={styles.sectionHeader}>
            <Activity size={20} color={theme.accent} />
            <Text style={[styles.sectionTitle, { color: theme.fg, marginLeft: spacing.md }]}>
              Today's Activity
            </Text>
          </View>
          <View style={styles.wearableGrid}>
            <View style={[styles.wearableMetric, { width: '48%' }]}>
              <Text style={[styles.wearableValue, { color: theme.accent }]}>8,452</Text>
              <Text style={[styles.wearableLabel, { color: theme.muted }]}>Steps</Text>
            </View>
            <View style={[styles.wearableMetric, { width: '48%' }]}>
              <Text style={[styles.wearableValue, { color: theme.accent }]}>72</Text>
              <Text style={[styles.wearableLabel, { color: theme.muted }]}>bpm</Text>
            </View>
            <View style={[styles.wearableMetric, { width: '48%' }]}>
              <Text style={[styles.wearableValue, { color: theme.accent }]}>7h 24m</Text>
              <Text style={[styles.wearableLabel, { color: theme.muted }]}>Sleep</Text>
            </View>
            <View style={[styles.wearableMetric, { width: '48%' }]}>
              <Text style={[styles.wearableValue, { color: theme.accent }]}>98%</Text>
              <Text style={[styles.wearableLabel, { color: theme.muted }]}>SpO2</Text>
            </View>
          </View>
        </Card>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <Button title="Ask Uma" onPress={() => {}} style={{ marginBottom: spacing.md }} />
          <Button
            title="Upload Records"
            onPress={() => {}}
            variant="outline"
            style={{ marginBottom: spacing.md }}
          />
        </View>

        {/* Disclaimer */}
        <View style={[styles.disclaimer, { borderTopColor: theme.border }]}>
          <Text style={[styles.disclaimerText, { color: theme.muted }]}>
            This dashboard is for informational purposes only. Always consult with your healthcare
            provider for medical advice.
          </Text>
        </View>
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
  greeting: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'space-grotesk',
    marginBottom: spacing.xs,
  },
  name: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'fraunces-bold',
  },
  profileCard: {
    marginBottom: spacing.lg,
  },
  profileContent: {
    gap: spacing.md,
  },
  profileSection: {
    marginBottom: spacing.md,
  },
  profileLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'space-grotesk',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  tagList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.full,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'space-grotesk',
  },
  nextVisitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  nextVisitText: {
    fontSize: 13,
    fontFamily: 'space-grotesk',
  },
  sectionCard: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'space-grotesk',
  },
  labRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  labName: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'space-grotesk',
    marginBottom: spacing.xs,
  },
  labDate: {
    fontSize: 12,
    fontFamily: 'space-grotesk',
  },
  labValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'space-grotesk',
  },
  medRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  medName: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'space-grotesk',
    marginBottom: spacing.xs,
  },
  medDetails: {
    fontSize: 12,
    fontFamily: 'space-grotesk',
  },
  wearableGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  wearableMetric: {
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  wearableValue: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'space-grotesk',
    marginBottom: spacing.xs,
  },
  wearableLabel: {
    fontSize: 12,
    fontFamily: 'space-grotesk',
  },
  actionContainer: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  disclaimer: {
    borderTopWidth: 1,
    paddingTop: spacing.lg,
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: 'space-grotesk',
  },
});
