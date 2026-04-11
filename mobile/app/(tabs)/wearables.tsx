import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  useWindowDimensions,
  Switch,
  TouchableOpacity,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { useTheme, spacing, radius } from '@/lib/theme';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  Activity, Heart, Moon, Wind, TrendingUp, Watch, ChevronRight,
  Compass, Zap, Circle, HeartPulse, Smartphone, CheckCircle2, Info,
} from 'lucide-react-native';
import {
  getAvailableProviders,
  getFeaturedProviders,
  getOtherProviders,
  getProviderById,
  getPlatformBridgeName,
  type WearableProvider,
} from '@/lib/wearables/providers';

/* ─── Icon resolver ──────────────────────────────────────────────── */

const ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  watch: Watch,
  activity: Activity,
  compass: Compass,
  zap: Zap,
  circle: Circle,
  'heart-pulse': HeartPulse,
  smartphone: Smartphone,
};

function ProviderIcon({ icon, size, color }: { icon: string; size: number; color: string }) {
  const IconComponent = ICON_MAP[icon] ?? Watch;
  return <IconComponent size={size} color={color} />;
}

/* ─── Types ──────────────────────────────────────────────────────── */

interface WearableData {
  steps: number;
  heartRate: number;
  sleepHours: number;
  spO2: number;
}

type ScreenState = 'select_provider' | 'setup_instructions' | 'connected';

/* ─── Main Screen ────────────────────────────────────────────────── */

export default function WearablesScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  // State
  const [screenState, setScreenState] = useState<ScreenState>('select_provider');
  const [selectedProvider, setSelectedProvider] = useState<WearableProvider | null>(null);
  const [permitNotifications, setPermitNotifications] = useState(true);

  // Provider lists (computed once based on Platform.OS)
  const featured = getFeaturedProviders();
  const others = getOtherProviders();

  const todayData: WearableData = {
    steps: 8452,
    heartRate: 72,
    sleepHours: 7.4,
    spO2: 98,
  };

  const contentWidth = isTablet ? '48%' : '100%';

  /* ─── Handlers ─────────────────────────────────────────────────── */

  const handleSelectProvider = useCallback((provider: WearableProvider) => {
    setSelectedProvider(provider);
    setScreenState('setup_instructions');
  }, []);

  const handleCompleteSetup = useCallback(() => {
    setScreenState('connected');
  }, []);

  const handleChangeDevice = useCallback(() => {
    setScreenState('select_provider');
    setSelectedProvider(null);
  }, []);

  const handleOpenCompanionApp = useCallback((provider: WearableProvider) => {
    const bundleId = Platform.OS === 'ios'
      ? provider.companionApp?.ios
      : provider.companionApp?.android;

    if (!bundleId) {
      Alert.alert(
        'Companion App',
        `Please install the ${provider.name} app from the ${Platform.OS === 'ios' ? 'App Store' : 'Play Store'}.`
      );
      return;
    }

    // Deep link to the app or its store listing
    const storeUrl = Platform.OS === 'ios'
      ? `https://apps.apple.com/app/${bundleId}`
      : `https://play.google.com/store/apps/details?id=${bundleId}`;

    Linking.openURL(storeUrl).catch(() => {
      Alert.alert('Unable to open store', 'Please search for the app manually.');
    });
  }, []);

  /* ─── Sub-renders ──────────────────────────────────────────────── */

  const renderMetricCard = (
    icon: React.ReactNode,
    label: string,
    value: string | number,
    unit: string,
  ) => (
    <Card
      style={[styles.metricCard, { width: '48%', marginBottom: spacing.lg }]}
      padding="md"
    >
      <View style={styles.metricHeader}>
        {icon}
        <Text style={[styles.metricLabel, { color: theme.muted, marginLeft: spacing.md }]}>
          {label}
        </Text>
      </View>
      <View style={styles.metricValue}>
        <Text style={[styles.metricNumber, { color: theme.accent }]}>{value}</Text>
        <Text style={[styles.metricUnit, { color: theme.muted }]}>{unit}</Text>
      </View>
    </Card>
  );

  const renderProviderCard = (provider: WearableProvider) => (
    <TouchableOpacity
      key={provider.id}
      activeOpacity={0.7}
      onPress={() => handleSelectProvider(provider)}
    >
      <Card style={[styles.providerCard, { marginBottom: spacing.md }]} padding="md">
        <View style={styles.providerContent}>
          <View style={[styles.providerIconWrap, { backgroundColor: provider.brandColor + '18' }]}>
            <ProviderIcon icon={provider.icon} size={22} color={provider.brandColor} />
          </View>
          <View style={styles.providerInfo}>
            <Text style={[styles.providerName, { color: theme.fg }]}>{provider.name}</Text>
            <Text
              style={[styles.providerDesc, { color: theme.muted }]}
              numberOfLines={2}
            >
              {provider.description}
            </Text>
          </View>
          <ChevronRight size={18} color={theme.muted} />
        </View>
      </Card>
    </TouchableOpacity>
  );

  /* ─── Screen: Provider Selection ───────────────────────────────── */

  const renderProviderSelection = () => (
    <>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.fg }]}>Connect a Wearable</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Choose your device to start tracking health metrics.
          {'\n'}Data is read through {getPlatformBridgeName()}.
        </Text>
      </View>

      {/* Platform badge */}
      <View style={[styles.platformBadge, { backgroundColor: theme.accent + '15' }]}>
        <Info size={14} color={theme.accent} />
        <Text style={[styles.platformBadgeText, { color: theme.accent }]}>
          Showing {Platform.OS === 'ios' ? 'iOS' : 'Android'}-compatible devices
        </Text>
      </View>

      {/* Featured providers */}
      {featured.length > 0 && (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={[styles.sectionLabel, { color: theme.fg }]}>Recommended</Text>
          {featured.map(renderProviderCard)}
        </View>
      )}

      {/* Other providers */}
      {others.length > 0 && (
        <View style={{ marginTop: spacing.xl }}>
          <Text style={[styles.sectionLabel, { color: theme.fg }]}>Other Devices</Text>
          <Text style={[styles.sectionHint, { color: theme.muted }]}>
            These sync through their companion app → {getPlatformBridgeName()}
          </Text>
          {others.map(renderProviderCard)}
        </View>
      )}
    </>
  );

  /* ─── Screen: Setup Instructions ───────────────────────────────── */

  const renderSetupInstructions = () => {
    if (!selectedProvider) return null;

    return (
      <>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleChangeDevice} style={styles.backLink}>
            <Text style={[styles.backLinkText, { color: theme.accent }]}>← All devices</Text>
          </TouchableOpacity>
          <View style={[styles.setupIconWrap, { backgroundColor: selectedProvider.brandColor + '18' }]}>
            <ProviderIcon icon={selectedProvider.icon} size={32} color={selectedProvider.brandColor} />
          </View>
          <Text style={[styles.title, { color: theme.fg, marginTop: spacing.md }]}>
            Set Up {selectedProvider.name}
          </Text>
        </View>

        {/* How it works */}
        <Card style={{ marginTop: spacing.lg }} padding="md">
          <Text style={[styles.cardTitle, { color: theme.fg, marginBottom: spacing.md }]}>
            How it works
          </Text>
          <Text style={[styles.bodyText, { color: theme.muted }]}>
            {selectedProvider.connectionMethod === 'native'
              ? `${selectedProvider.name} syncs directly with ${getPlatformBridgeName()}. UMA reads your health data from there — no extra apps needed.`
              : `${selectedProvider.name} writes data to ${getPlatformBridgeName()} via its companion app. UMA then reads your metrics from ${getPlatformBridgeName()}.`}
          </Text>
        </Card>

        {/* Step-by-step instructions */}
        <Card style={{ marginTop: spacing.lg }} padding="md">
          <Text style={[styles.cardTitle, { color: theme.fg, marginBottom: spacing.lg }]}>
            Setup Steps
          </Text>
          {selectedProvider.setupInstructions.map((step, i) => (
            <View key={i} style={[styles.stepRow, i > 0 && { marginTop: spacing.md }]}>
              <View style={[styles.stepNumber, { backgroundColor: theme.accent + '20' }]}>
                <Text style={[styles.stepNumberText, { color: theme.accent }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: theme.fg }]}>{step}</Text>
            </View>
          ))}
        </Card>

        {/* Companion app link (if needed) */}
        {selectedProvider.connectionMethod === 'companion_app' && (
          <Button
            title={`Open ${selectedProvider.name} App`}
            variant="ghost"
            onPress={() => handleOpenCompanionApp(selectedProvider)}
            style={{ marginTop: spacing.lg }}
          />
        )}

        {/* Supported metrics */}
        <Card style={{ marginTop: spacing.lg }} padding="md" variant="muted">
          <Text style={[styles.cardTitle, { color: theme.fg, marginBottom: spacing.md }]}>
            Supported Metrics
          </Text>
          <View style={styles.metricsChipRow}>
            {selectedProvider.supportedMetrics.map((metric) => (
              <View
                key={metric}
                style={[styles.metricChip, { backgroundColor: theme.accent + '12' }]}
              >
                <Text style={[styles.metricChipText, { color: theme.accent }]}>
                  {metric.replace(/_/g, ' ')}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Complete setup button */}
        <Button
          title="I've Completed the Steps"
          onPress={handleCompleteSetup}
          style={{ marginTop: spacing.xl }}
        />
      </>
    );
  };

  /* ─── Screen: Connected (Metrics Dashboard) ────────────────────── */

  const renderConnectedView = () => (
    <>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.fg }]}>Wearable Activity</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Track your health metrics from your connected device
        </Text>
      </View>

      {/* Connection Status */}
      <Card style={[styles.statusCard, { width: contentWidth }]} padding="md">
        <View style={styles.statusContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            {selectedProvider && (
              <View
                style={[
                  styles.statusIcon,
                  { backgroundColor: selectedProvider.brandColor + '18', marginRight: spacing.md },
                ]}
              >
                <ProviderIcon icon={selectedProvider.icon} size={18} color={selectedProvider.brandColor} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusLabel, { color: theme.fg }]}>
                {selectedProvider?.name ?? 'Connected'}
              </Text>
              <Text style={[styles.statusDetail, { color: theme.muted, marginTop: spacing.xs }]}>
                Last synced 5 minutes ago via {getPlatformBridgeName()}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: theme.success + '20' }]}>
            <CheckCircle2 size={16} color={theme.success} />
          </View>
        </View>
        <TouchableOpacity onPress={handleChangeDevice} style={{ marginTop: spacing.sm }}>
          <Text style={[styles.changeLinkText, { color: theme.accent }]}>Change device</Text>
        </TouchableOpacity>
      </Card>

      {/* Today's Metrics Grid */}
      <View style={[styles.metricsGrid, { marginTop: spacing.xl }]}>
        {renderMetricCard(
          <Activity size={20} color={theme.accent} />, 'Steps',
          todayData.steps.toLocaleString(), 'steps',
        )}
        {renderMetricCard(
          <Heart size={20} color={theme.accent2} />, 'Heart Rate',
          todayData.heartRate, 'bpm',
        )}
        {renderMetricCard(
          <Moon size={20} color={theme.accent} />, 'Sleep',
          todayData.sleepHours, 'hours',
        )}
        {renderMetricCard(
          <Wind size={20} color={theme.accent2} />, 'SpO2',
          todayData.spO2, '%',
        )}
      </View>

      {/* Weekly Overview */}
      <Card style={[styles.trendCard, { width: contentWidth, marginTop: spacing.xl }]} padding="md">
        <View style={styles.trendHeader}>
          <TrendingUp size={20} color={theme.accent} />
          <Text style={[styles.trendTitle, { color: theme.fg, marginLeft: spacing.md }]}>
            This Week's Trends
          </Text>
        </View>
        <View style={[styles.trendContent, { marginTop: spacing.lg }]}>
          <View style={styles.trendItem}>
            <Text style={[styles.trendLabel, { color: theme.muted }]}>Avg Steps</Text>
            <Text style={[styles.trendValue, { color: theme.accent }]}>8,906</Text>
            <Text style={[styles.trendChange, { color: theme.success }]}>↑ 12% vs last week</Text>
          </View>
          <View style={[styles.trendDivider, { borderBottomColor: theme.border }]} />
          <View style={styles.trendItem}>
            <Text style={[styles.trendLabel, { color: theme.muted }]}>Avg Sleep</Text>
            <Text style={[styles.trendValue, { color: theme.accent }]}>7.3 hrs</Text>
            <Text style={[styles.trendChange, { color: theme.success }]}>↑ 4% vs last week</Text>
          </View>
        </View>
      </Card>

      {/* Insights */}
      <Card
        variant="muted"
        style={[styles.insightsCard, { width: contentWidth, marginTop: spacing.lg }]}
        padding="md"
      >
        <Text style={[styles.insightsTitle, { color: theme.fg, marginBottom: spacing.md }]}>
          Weekly Insights
        </Text>
        <Text style={[styles.insightsText, { color: theme.fg }]}>
          You're walking more this week! Keep up the great activity level. Your sleep has
          been consistent — this is excellent for your overall health.
        </Text>
        <Button
          title="Ask Uma about trends"
          variant="ghost"
          size="sm"
          onPress={() => {}}
          style={{ marginTop: spacing.md }}
        />
      </Card>

      {/* Settings */}
      <Card
        style={[styles.settingsCard, { width: contentWidth, marginTop: spacing.xl }]}
        padding="md"
      >
        <Text style={[styles.settingsTitle, { color: theme.fg, marginBottom: spacing.lg }]}>
          Notifications
        </Text>
        <View style={[styles.settingRow, { borderBottomColor: theme.border }]}>
          <View>
            <Text style={[styles.settingLabel, { color: theme.fg }]}>Activity Reminders</Text>
            <Text style={[styles.settingDetail, { color: theme.muted, marginTop: spacing.xs }]}>
              Get reminded to move throughout the day
            </Text>
          </View>
          <Switch
            value={permitNotifications}
            onValueChange={setPermitNotifications}
            trackColor={{ false: theme.border, true: theme.accent + '80' }}
            thumbColor={permitNotifications ? theme.accent : theme.muted}
          />
        </View>
        <View style={styles.settingRow}>
          <View>
            <Text style={[styles.settingLabel, { color: theme.fg }]}>Sync Status</Text>
            <Text style={[styles.settingDetail, { color: theme.muted, marginTop: spacing.xs }]}>
              Data syncs automatically
            </Text>
          </View>
          <View style={[styles.syncBadge, { backgroundColor: theme.success + '20' }]}>
            <Text style={[styles.syncText, { color: theme.success }]}>On</Text>
          </View>
        </View>
      </Card>
    </>
  );

  /* ─── Main render ──────────────────────────────────────────────── */

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {screenState === 'select_provider' && renderProviderSelection()}
        {screenState === 'setup_instructions' && renderSetupInstructions()}
        {screenState === 'connected' && renderConnectedView()}

        {/* Disclaimer */}
        <View style={[styles.disclaimer, { borderTopColor: theme.border, marginTop: spacing.xl }]}>
          <Text style={[styles.disclaimerText, { color: theme.muted }]}>
            Wearable data is for informational purposes and may not be medically accurate.
            Consult your healthcare provider for medical concerns.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingVertical: spacing.lg, paddingBottom: spacing.xxxl },
  header: { marginBottom: spacing.lg },
  title: { fontSize: 28, fontWeight: '700', fontFamily: 'fraunces-bold', marginBottom: spacing.sm },
  subtitle: { fontSize: 14, fontFamily: 'space-grotesk', lineHeight: 20 },

  /* Platform badge */
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    gap: spacing.sm,
  },
  platformBadgeText: { fontSize: 12, fontWeight: '600', fontFamily: 'space-grotesk' },

  /* Section labels */
  sectionLabel: { fontSize: 16, fontWeight: '600', fontFamily: 'space-grotesk', marginBottom: spacing.md },
  sectionHint: { fontSize: 12, fontFamily: 'space-grotesk', marginBottom: spacing.md, lineHeight: 18 },

  /* Provider cards */
  providerCard: {},
  providerContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  providerIconWrap: {
    width: 44, height: 44, borderRadius: radius.md,
    justifyContent: 'center', alignItems: 'center',
  },
  providerInfo: { flex: 1 },
  providerName: { fontSize: 15, fontWeight: '600', fontFamily: 'space-grotesk' },
  providerDesc: { fontSize: 12, fontFamily: 'space-grotesk', marginTop: 2, lineHeight: 17 },

  /* Setup instructions screen */
  backLink: { marginBottom: spacing.lg },
  backLinkText: { fontSize: 14, fontWeight: '500', fontFamily: 'space-grotesk' },
  setupIconWrap: {
    width: 64, height: 64, borderRadius: radius.lg,
    justifyContent: 'center', alignItems: 'center', alignSelf: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '600', fontFamily: 'space-grotesk' },
  bodyText: { fontSize: 13, fontFamily: 'space-grotesk', lineHeight: 20 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stepNumber: {
    width: 26, height: 26, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center',
  },
  stepNumberText: { fontSize: 13, fontWeight: '700', fontFamily: 'space-grotesk' },
  stepText: { fontSize: 13, fontFamily: 'space-grotesk', lineHeight: 20, flex: 1, paddingTop: 2 },
  metricsChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full },
  metricChipText: { fontSize: 11, fontWeight: '500', fontFamily: 'space-grotesk', textTransform: 'capitalize' },

  /* Connected view */
  statusCard: { width: '100%' },
  statusContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusIcon: { width: 36, height: 36, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  statusLabel: { fontSize: 16, fontWeight: '600', fontFamily: 'space-grotesk' },
  statusDetail: { fontSize: 12, fontFamily: 'space-grotesk' },
  statusBadge: {
    width: 36, height: 36, borderRadius: radius.full,
    justifyContent: 'center', alignItems: 'center',
  },
  changeLinkText: { fontSize: 13, fontWeight: '500', fontFamily: 'space-grotesk' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  metricCard: { minHeight: 100 },
  metricHeader: { flexDirection: 'row', alignItems: 'center' },
  metricLabel: { fontSize: 12, fontWeight: '600', fontFamily: 'space-grotesk', textTransform: 'uppercase' },
  metricValue: { marginTop: spacing.md },
  metricNumber: { fontSize: 24, fontWeight: '700', fontFamily: 'space-grotesk' },
  metricUnit: { fontSize: 12, fontFamily: 'space-grotesk', marginTop: spacing.xs },
  trendCard: { width: '100%' },
  trendHeader: { flexDirection: 'row', alignItems: 'center' },
  trendTitle: { fontSize: 16, fontWeight: '600', fontFamily: 'space-grotesk' },
  trendContent: { gap: spacing.md },
  trendItem: { paddingVertical: spacing.md },
  trendLabel: { fontSize: 12, fontFamily: 'space-grotesk', textTransform: 'uppercase', marginBottom: spacing.sm },
  trendValue: { fontSize: 18, fontWeight: '700', fontFamily: 'space-grotesk' },
  trendChange: { fontSize: 12, fontFamily: 'space-grotesk', marginTop: spacing.xs },
  trendDivider: { borderBottomWidth: 1 },
  insightsCard: { width: '100%' },
  insightsTitle: { fontSize: 14, fontWeight: '600', fontFamily: 'space-grotesk' },
  insightsText: { fontSize: 13, lineHeight: 20, fontFamily: 'space-grotesk' },
  settingsCard: { width: '100%' },
  settingsTitle: { fontSize: 16, fontWeight: '600', fontFamily: 'space-grotesk' },
  settingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.lg, borderBottomWidth: 1,
  },
  settingLabel: { fontSize: 14, fontWeight: '500', fontFamily: 'space-grotesk' },
  settingDetail: { fontSize: 12, fontFamily: 'space-grotesk' },
  syncBadge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full },
  syncText: { fontSize: 12, fontWeight: '600', fontFamily: 'space-grotesk' },
  disclaimer: { borderTopWidth: 1, paddingTop: spacing.lg, width: '100%' },
  disclaimerText: { fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'space-grotesk' },
});
