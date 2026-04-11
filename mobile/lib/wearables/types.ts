/**
 * UMA Mobile — Wearable Abstraction Layer Types
 *
 * Unified type definitions for wearable health data across iOS (HealthKit)
 * and Android (Health Connect). Abstracts platform-specific details so
 * the rest of the app stays platform-agnostic.
 */

/* ─── Permission types ──────────────────────────────────────────────── */

/**
 * Wearable health metric types that can be requested
 */
export type MetricType =
  | 'steps'
  | 'heart_rate'
  | 'resting_heart_rate'
  | 'sleep'
  | 'spo2'
  | 'active_energy'
  | 'distance'
  | 'flights_climbed'
  | 'temperature';

/**
 * Permission scope granularity (whether we read-only or read-write)
 */
export type PermissionScope = 'read' | 'write';

/**
 * Result of a permission request
 */
export interface PermissionResult {
  metric: MetricType;
  granted: boolean;
  scope: PermissionScope;
  reason?: string; // Error message if denied
}

/* ─── Date range queries ────────────────────────────────────────────── */

/**
 * Date range for querying wearable data
 */
export interface DateRange {
  startISO: string; // ISO 8601 date (YYYY-MM-DD) or datetime
  endISO: string;   // ISO 8601 date or datetime
}

/* ─── Unified data types ────────────────────────────────────────────── */

/**
 * Single step count data point
 */
export interface StepData {
  timestamp: string; // ISO 8601 datetime
  steps: number;
  source: WearableSource;
}

/**
 * The underlying OS data bridge used to read wearable data.
 * Regardless of which brand of wearable the user has (Garmin, Whoop, etc.),
 * we read through either Apple HealthKit or Android Health Connect.
 */
export type WearableSource = 'apple_health' | 'health_connect' | 'manual';

/**
 * Heart rate data point(s)
 */
export interface HeartRateData {
  timestamp: string; // ISO 8601 datetime
  bpm: number;
  source: WearableSource;
}

/**
 * Resting heart rate (typically measured once daily)
 */
export interface RestingHeartRateData {
  timestamp: string; // ISO 8601 datetime
  bpm: number;
  source: WearableSource;
}

/**
 * Sleep session with optional stage breakdown
 */
export interface SleepData {
  startISO: string; // ISO 8601 datetime
  endISO: string;   // ISO 8601 datetime
  durationMinutes: number;
  stages?: {
    deep?: number;      // minutes
    light?: number;     // minutes
    rem?: number;       // minutes
    awake?: number;     // minutes
  };
  source: WearableSource;
}

/**
 * Blood oxygen (SpO2) data point
 */
export interface SpO2Data {
  timestamp: string; // ISO 8601 datetime
  percentage: number; // 0-100
  source: WearableSource;
}

/**
 * Active energy burned (e.g., Apple Watch "Move" ring)
 */
export interface ActiveEnergyData {
  timestamp: string; // ISO 8601 datetime
  kcal: number;
  source: WearableSource;
}

/**
 * Distance traveled (walking, running, etc.)
 */
export interface DistanceData {
  timestamp: string; // ISO 8601 datetime
  meters: number;
  source: WearableSource;
}

/**
 * Flights of stairs climbed
 */
export interface FlightsClimbedData {
  timestamp: string; // ISO 8601 datetime
  flights: number;
  source: WearableSource;
}

/**
 * Body temperature data
 */
export interface TemperatureData {
  timestamp: string; // ISO 8601 datetime
  celsius: number;
  source: WearableSource;
}

/**
 * Daily summary combining multiple metrics
 */
export interface DailyWearableSummary {
  date: string; // YYYY-MM-DD
  steps?: number;
  avgHeartRate?: number;
  restingHeartRate?: number;
  sleepDurationMinutes?: number;
  sleepQuality?: 'poor' | 'fair' | 'good' | 'excellent';
  activeEnergyKcal?: number;
  avgSpO2?: number;
  distanceMeters?: number;
  flightsClimbed?: number;
  source: WearableSource;
}

/* ─── Realtime subscription ────────────────────────────────────────── */

/**
 * Callback for real-time wearable data updates
 */
export type RealtimeCallback = (data: DailyWearableSummary) => void;

/**
 * Handle for unsubscribing from realtime updates
 */
export interface RealtimeSubscription {
  unsubscribe: () => void;
}

/* ─── Main wearable service interface ────────────────────────────────── */

/**
 * Unified wearable service interface
 *
 * Implementations (HealthKit, Health Connect) should support all methods.
 * If a metric is not available on a platform, the method should return an
 * empty array or throw a descriptive error.
 */
export interface WearableService {
  /**
   * Request permission to access specific metrics
   *
   * @param metrics - Array of metrics to request
   * @param scope - Read or write access (default: read)
   * @returns Array of permission results
   */
  requestPermissions(
    metrics: MetricType[],
    scope?: PermissionScope
  ): Promise<PermissionResult[]>;

  /**
   * Check if permissions are already granted for a metric
   */
  hasPermission(metric: MetricType): Promise<boolean>;

  /**
   * Fetch step data for a date range
   *
   * @param dateRange - Start and end dates (ISO format)
   * @returns Array of step data points, one per day by default
   */
  getSteps(dateRange: DateRange): Promise<StepData[]>;

  /**
   * Fetch heart rate data for a date range
   *
   * @param dateRange - Start and end dates
   * @returns Array of heart rate data points (may be multiple per day)
   */
  getHeartRate(dateRange: DateRange): Promise<HeartRateData[]>;

  /**
   * Fetch resting heart rate data
   *
   * @param dateRange - Start and end dates
   * @returns Array of resting heart rate values (one per day typically)
   */
  getRestingHeartRate(dateRange: DateRange): Promise<RestingHeartRateData[]>;

  /**
   * Fetch sleep data for a date range
   *
   * @param dateRange - Start and end dates
   * @returns Array of sleep sessions (may span midnight)
   */
  getSleep(dateRange: DateRange): Promise<SleepData[]>;

  /**
   * Fetch blood oxygen (SpO2) data
   *
   * @param dateRange - Start and end dates
   * @returns Array of SpO2 measurements
   */
  getSpO2(dateRange: DateRange): Promise<SpO2Data[]>;

  /**
   * Fetch active energy data
   *
   * @param dateRange - Start and end dates
   * @returns Array of active energy measurements
   */
  getActiveEnergy(dateRange: DateRange): Promise<ActiveEnergyData[]>;

  /**
   * Fetch distance data
   *
   * @param dateRange - Start and end dates
   * @returns Array of distance measurements
   */
  getDistance(dateRange: DateRange): Promise<DistanceData[]>;

  /**
   * Fetch flights climbed data
   *
   * @param dateRange - Start and end dates
   * @returns Array of flights climbed
   */
  getFlightsClimbed(dateRange: DateRange): Promise<FlightsClimbedData[]>;

  /**
   * Fetch temperature data
   *
   * @param dateRange - Start and end dates
   * @returns Array of temperature measurements
   */
  getTemperature(dateRange: DateRange): Promise<TemperatureData[]>;

  /**
   * Subscribe to real-time data updates
   * Watches for new data and calls the callback when available
   *
   * @param metric - Metric to watch
   * @param callback - Called with daily summary when data arrives
   * @returns Subscription handle for unsubscribing
   */
  subscribeToRealtime(
    metric: MetricType,
    callback: RealtimeCallback
  ): Promise<RealtimeSubscription>;

  /**
   * Check if the service is available (e.g., HealthKit on iOS, Health Connect on Android)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get the underlying data source (e.g., 'apple_health', 'health_connect')
   */
  getDataSource(): WearableSource | 'unsupported';
}

/* ─── Sync and storage types ──────────────────────────────────────────── */

/**
 * Result of syncing wearable data to the server
 */
export interface SyncResult {
  synced: number; // Number of records synced
  failed: number;
  lastSyncISO: string; // When the sync completed
  errors?: string[];
}

/**
 * Options for wearable data sync
 */
export interface SyncOptions {
  days?: number; // Number of days back to sync (default: 7)
  force?: boolean; // Force re-sync even if recent sync exists
  metrics?: MetricType[]; // Specific metrics to sync (default: all)
}
