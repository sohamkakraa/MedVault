/**
 * UMA Mobile — Wearable Provider Registry
 *
 * Platform-aware registry of supported wearable providers.
 * Android users see only Android-compatible wearables (Health Connect ecosystem).
 * iOS users see Apple Watch (HealthKit) plus third-party devices that publish
 * data to HealthKit.
 *
 * Design note: On iOS, third-party wearables (Whoop, Garmin, Fitbit, Oura, etc.)
 * write their data into HealthKit via their companion apps. So we still read from
 * HealthKit — the "provider" selection just tells the user which devices are
 * compatible and controls which setup instructions we show.
 *
 * On Android, Health Connect is the universal bridge. Third-party apps write into
 * Health Connect, and we read from Health Connect. Same pattern, different platform.
 */

import { Platform } from 'react-native';

/* ─── Types ───────────────────────────────────────────────────────── */

export type WearablePlatform = 'ios' | 'android' | 'both';

export type DataBridge = 'healthkit' | 'health_connect';

export type ConnectionMethod =
  | 'native'          // Built-in OS integration (Apple Watch ↔ HealthKit)
  | 'companion_app'   // Requires installing the brand's companion app
  | 'health_connect'; // Direct Health Connect integration on Android

export interface WearableProvider {
  /** Unique slug identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short description for the setup screen */
  description: string;
  /** Which platforms this provider supports */
  platforms: WearablePlatform;
  /** The OS health data bridge used to read data */
  dataBridge: DataBridge;
  /** How the device connects */
  connectionMethod: ConnectionMethod;
  /** Brand icon name from lucide-react-native (or a key for a custom icon) */
  icon: string;
  /** Brand accent color for the provider card */
  brandColor: string;
  /** Companion app package/bundle ID (for deep linking) */
  companionApp?: {
    ios?: string;    // App Store bundle ID
    android?: string; // Play Store package name
  };
  /** Metrics this provider typically supports */
  supportedMetrics: string[];
  /** Setup instructions shown to the user */
  setupInstructions: string[];
  /** Whether this is a "featured" / top-tier integration */
  featured: boolean;
}

/* ─── Provider definitions ────────────────────────────────────────── */

const ALL_PROVIDERS: WearableProvider[] = [
  /* ── Apple Watch (iOS only) ────────────────────────────────────── */
  {
    id: 'apple_watch',
    name: 'Apple Watch',
    description: 'Native integration via HealthKit. Automatic sync with no companion app needed.',
    platforms: 'ios',
    dataBridge: 'healthkit',
    connectionMethod: 'native',
    icon: 'watch',
    brandColor: '#007AFF',
    supportedMetrics: [
      'steps', 'heart_rate', 'resting_heart_rate', 'sleep',
      'spo2', 'active_energy', 'distance', 'flights_climbed', 'temperature',
    ],
    setupInstructions: [
      'Open the Health app on your iPhone',
      'Go to Sharing → Apps and grant UMA access',
      'Your Apple Watch data will sync automatically',
    ],
    featured: true,
  },

  /* ── Google Pixel Watch / Wear OS (Android only) ───────────────── */
  {
    id: 'google_wearos',
    name: 'Google Pixel Watch',
    description: 'Native Health Connect integration for Pixel Watch and Wear OS devices.',
    platforms: 'android',
    dataBridge: 'health_connect',
    connectionMethod: 'health_connect',
    icon: 'watch',
    brandColor: '#4285F4',
    supportedMetrics: [
      'steps', 'heart_rate', 'resting_heart_rate', 'sleep',
      'spo2', 'active_energy', 'distance', 'flights_climbed',
    ],
    setupInstructions: [
      'Install Health Connect from the Play Store (if not pre-installed)',
      'Open Health Connect → App permissions → Grant UMA access',
      'Your Wear OS watch data will sync through Health Connect',
    ],
    featured: true,
  },

  /* ── Samsung Galaxy Watch (Android only) ───────────────────────── */
  {
    id: 'samsung_health',
    name: 'Samsung Galaxy Watch',
    description: 'Connects via Samsung Health and Health Connect.',
    platforms: 'android',
    dataBridge: 'health_connect',
    connectionMethod: 'companion_app',
    icon: 'smartphone',
    brandColor: '#1428A0',
    companionApp: {
      android: 'com.sec.android.app.shealth',
    },
    supportedMetrics: [
      'steps', 'heart_rate', 'resting_heart_rate', 'sleep',
      'spo2', 'active_energy', 'distance',
    ],
    setupInstructions: [
      'Install Samsung Health from the Galaxy Store or Play Store',
      'Enable Health Connect sync in Samsung Health → Settings → Health Connect',
      'Open Health Connect → App permissions → Grant UMA access',
    ],
    featured: true,
  },

  /* ── Fitbit (both platforms) ───────────────────────────────────── */
  {
    id: 'fitbit',
    name: 'Fitbit',
    description: 'Syncs via the Fitbit app. Supports Charge, Versa, Sense, and Inspire series.',
    platforms: 'both',
    dataBridge: Platform.OS === 'ios' ? 'healthkit' : 'health_connect',
    connectionMethod: 'companion_app',
    icon: 'activity',
    brandColor: '#00B0B9',
    companionApp: {
      ios: 'com.fitbit.FitbitMobile',
      android: 'com.fitbit.FitbitMobile',
    },
    supportedMetrics: [
      'steps', 'heart_rate', 'resting_heart_rate', 'sleep',
      'spo2', 'active_energy', 'distance', 'flights_climbed',
    ],
    setupInstructions: Platform.OS === 'ios'
      ? [
          'Install the Fitbit app from the App Store',
          'In Fitbit app → Account → Enable HealthKit sync',
          'Open the Health app → Sharing → Grant UMA access',
        ]
      : [
          'Install the Fitbit app from the Play Store',
          'In Fitbit app → Account → Enable Health Connect sync',
          'Open Health Connect → App permissions → Grant UMA access',
        ],
    featured: false,
  },

  /* ── Garmin (both platforms) ───────────────────────────────────── */
  {
    id: 'garmin',
    name: 'Garmin',
    description: 'Syncs via Garmin Connect. Supports Venu, Forerunner, Fenix, and Vivosmart.',
    platforms: 'both',
    dataBridge: Platform.OS === 'ios' ? 'healthkit' : 'health_connect',
    connectionMethod: 'companion_app',
    icon: 'compass',
    brandColor: '#007CC3',
    companionApp: {
      ios: 'com.garmin.connect.mobile',
      android: 'com.garmin.android.apps.connectmobile',
    },
    supportedMetrics: [
      'steps', 'heart_rate', 'resting_heart_rate', 'sleep',
      'spo2', 'active_energy', 'distance', 'flights_climbed',
    ],
    setupInstructions: Platform.OS === 'ios'
      ? [
          'Install Garmin Connect from the App Store',
          'In Garmin Connect → Settings → Health → Enable Apple Health',
          'Open the Health app → Sharing → Grant UMA access',
        ]
      : [
          'Install Garmin Connect from the Play Store',
          'In Garmin Connect → Settings → Health → Enable Health Connect',
          'Open Health Connect → App permissions → Grant UMA access',
        ],
    featured: false,
  },

  /* ── Whoop (both platforms) ────────────────────────────────────── */
  {
    id: 'whoop',
    name: 'WHOOP',
    description: 'Recovery and strain tracking. Syncs via the WHOOP app.',
    platforms: 'both',
    dataBridge: Platform.OS === 'ios' ? 'healthkit' : 'health_connect',
    connectionMethod: 'companion_app',
    icon: 'zap',
    brandColor: '#00DC5A',
    companionApp: {
      ios: 'com.whoop.whoop',
      android: 'com.whoop.android',
    },
    supportedMetrics: [
      'heart_rate', 'resting_heart_rate', 'sleep', 'spo2', 'active_energy',
    ],
    setupInstructions: Platform.OS === 'ios'
      ? [
          'Install the WHOOP app from the App Store',
          'In WHOOP → More → Health Monitor → Enable Apple Health',
          'Open the Health app → Sharing → Grant UMA access',
        ]
      : [
          'Install the WHOOP app from the Play Store',
          'In WHOOP → More → Health Monitor → Enable Health Connect',
          'Open Health Connect → App permissions → Grant UMA access',
        ],
    featured: false,
  },

  /* ── Oura Ring (both platforms) ────────────────────────────────── */
  {
    id: 'oura',
    name: 'Oura Ring',
    description: 'Sleep and readiness tracking. Syncs via the Oura app.',
    platforms: 'both',
    dataBridge: Platform.OS === 'ios' ? 'healthkit' : 'health_connect',
    connectionMethod: 'companion_app',
    icon: 'circle',
    brandColor: '#D4AF37',
    companionApp: {
      ios: 'com.ouraring.oura',
      android: 'com.ouraring.oura',
    },
    supportedMetrics: [
      'heart_rate', 'resting_heart_rate', 'sleep', 'spo2', 'temperature',
      'active_energy', 'steps',
    ],
    setupInstructions: Platform.OS === 'ios'
      ? [
          'Install the Oura app from the App Store',
          'In Oura → Settings → Apple Health → Enable all categories',
          'Open the Health app → Sharing → Grant UMA access',
        ]
      : [
          'Install the Oura app from the Play Store',
          'In Oura → Settings → Health Connect → Enable all categories',
          'Open Health Connect → App permissions → Grant UMA access',
        ],
    featured: false,
  },

  /* ── Withings (both platforms) ─────────────────────────────────── */
  {
    id: 'withings',
    name: 'Withings',
    description: 'ScanWatch, Body scales, and BPM monitors. Syncs via Withings Health Mate.',
    platforms: 'both',
    dataBridge: Platform.OS === 'ios' ? 'healthkit' : 'health_connect',
    connectionMethod: 'companion_app',
    icon: 'heart-pulse',
    brandColor: '#00BCD4',
    companionApp: {
      ios: 'com.withings.wiScaleNG',
      android: 'com.withings.wiscale2',
    },
    supportedMetrics: [
      'steps', 'heart_rate', 'sleep', 'spo2', 'temperature', 'distance',
    ],
    setupInstructions: Platform.OS === 'ios'
      ? [
          'Install Withings Health Mate from the App Store',
          'In Health Mate → Profile → Health → Enable Apple Health',
          'Open the Health app → Sharing → Grant UMA access',
        ]
      : [
          'Install Withings Health Mate from the Play Store',
          'In Health Mate → Profile → Health → Enable Health Connect',
          'Open Health Connect → App permissions → Grant UMA access',
        ],
    featured: false,
  },
];

/* ─── Public API ──────────────────────────────────────────────────── */

/**
 * Get all providers available on the current platform.
 * On iOS: returns Apple Watch + all providers with platforms 'ios' or 'both'.
 * On Android: returns Android-only + all providers with platforms 'android' or 'both'.
 */
export function getAvailableProviders(): WearableProvider[] {
  const currentPlatform = Platform.OS; // 'ios' | 'android'

  return ALL_PROVIDERS.filter((provider) => {
    if (provider.platforms === 'both') return true;
    return provider.platforms === currentPlatform;
  });
}

/**
 * Get featured providers (shown prominently at the top of the selection screen)
 */
export function getFeaturedProviders(): WearableProvider[] {
  return getAvailableProviders().filter((p) => p.featured);
}

/**
 * Get non-featured providers (shown in a secondary "Other devices" section)
 */
export function getOtherProviders(): WearableProvider[] {
  return getAvailableProviders().filter((p) => !p.featured);
}

/**
 * Look up a specific provider by ID
 */
export function getProviderById(id: string): WearableProvider | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}

/**
 * Get the data bridge name for the current platform
 * (used for display purposes in the UI)
 */
export function getPlatformBridgeName(): string {
  return Platform.OS === 'ios' ? 'Apple HealthKit' : 'Health Connect';
}

/**
 * Get the data bridge type for the current platform
 */
export function getPlatformBridge(): DataBridge {
  return Platform.OS === 'ios' ? 'healthkit' : 'health_connect';
}
