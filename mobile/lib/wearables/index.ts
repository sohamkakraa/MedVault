/**
 * UMA Mobile — Unified Wearable Service
 *
 * Platform-aware entry point that detects iOS vs Android and delegates
 * to the appropriate implementation (HealthKit or Health Connect).
 *
 * Usage:
 *   import { wearableService, syncWearableData } from '@/lib/wearables';
 *
 *   // Check availability
 *   if (await wearableService.isAvailable()) {
 *     // Request permissions
 *     await wearableService.requestPermissions(['steps', 'heart_rate']);
 *
 *     // Fetch data
 *     const steps = await wearableService.getSteps({
 *       startISO: '2026-04-04',
 *       endISO: '2026-04-11'
 *     });
 *   }
 *
 *   // Or use the convenience sync function
 *   const result = await syncWearableData();
 */

import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import {
  WearableService,
  MetricType,
  PermissionScope,
  PermissionResult,
  DateRange,
  DailyWearableSummary,
  SyncOptions,
  SyncResult,
  RealtimeCallback,
  RealtimeSubscription,
  StepData,
  HeartRateData,
  RestingHeartRateData,
  SleepData,
  SpO2Data,
  ActiveEnergyData,
  DistanceData,
  FlightsClimbedData,
  TemperatureData,
} from './types';

import { HealthKitService } from './healthkit';
import { HealthConnectService } from './health-connect';

/* ─── Platform detection and singleton ────────────────────────────── */

let _wearableService: WearableService | null = null;

/**
 * Get the platform-specific wearable service (singleton)
 */
function getPlatformService(): WearableService {
  if (_wearableService) {
    return _wearableService;
  }

  if (Platform.OS === 'ios') {
    _wearableService = new HealthKitService();
  } else if (Platform.OS === 'android') {
    _wearableService = new HealthConnectService();
  } else {
    throw new Error(`Unsupported platform: ${Platform.OS}`);
  }

  return _wearableService;
}

/**
 * The main wearable service proxy
 * Delegates to the appropriate platform implementation
 */
export const wearableService: WearableService = {
  async requestPermissions(
    metrics: MetricType[],
    scope: PermissionScope = 'read'
  ): Promise<PermissionResult[]> {
    const service = getPlatformService();
    return service.requestPermissions(metrics, scope);
  },

  async hasPermission(metric: MetricType): Promise<boolean> {
    const service = getPlatformService();
    return service.hasPermission(metric);
  },

  async getSteps(dateRange: DateRange): Promise<StepData[]> {
    const service = getPlatformService();
    return service.getSteps(dateRange);
  },

  async getHeartRate(dateRange: DateRange): Promise<HeartRateData[]> {
    const service = getPlatformService();
    return service.getHeartRate(dateRange);
  },

  async getRestingHeartRate(dateRange: DateRange): Promise<RestingHeartRateData[]> {
    const service = getPlatformService();
    return service.getRestingHeartRate(dateRange);
  },

  async getSleep(dateRange: DateRange): Promise<SleepData[]> {
    const service = getPlatformService();
    return service.getSleep(dateRange);
  },

  async getSpO2(dateRange: DateRange): Promise<SpO2Data[]> {
    const service = getPlatformService();
    return service.getSpO2(dateRange);
  },

  async getActiveEnergy(dateRange: DateRange): Promise<ActiveEnergyData[]> {
    const service = getPlatformService();
    return service.getActiveEnergy(dateRange);
  },

  async getDistance(dateRange: DateRange): Promise<DistanceData[]> {
    const service = getPlatformService();
    return service.getDistance(dateRange);
  },

  async getFlightsClimbed(dateRange: DateRange): Promise<FlightsClimbedData[]> {
    const service = getPlatformService();
    return service.getFlightsClimbed(dateRange);
  },

  async getTemperature(dateRange: DateRange): Promise<TemperatureData[]> {
    const service = getPlatformService();
    return service.getTemperature(dateRange);
  },

  async subscribeToRealtime(
    metric: MetricType,
    callback: RealtimeCallback
  ): Promise<RealtimeSubscription> {
    const service = getPlatformService();
    return service.subscribeToRealtime(metric, callback);
  },

  async isAvailable(): Promise<boolean> {
    const service = getPlatformService();
    return service.isAvailable();
  },

  getDataSource() {
    const service = getPlatformService();
    return service.getDataSource();
  },
};

/* ─── Convenience sync function ────────────────────────────────────── */

/**
 * Fetch wearable data for the last N days and push to Supabase
 *
 * This is the main entry point for keeping wearable data in sync.
 * It fetches from the device, aggregates into daily summaries,
 * and upserts into the wearable_data table.
 *
 * @param options - Sync options (days back, force, specific metrics)
 * @returns Sync result with counts and errors
 */
export async function syncWearableData(
  options: SyncOptions = {}
): Promise<SyncResult> {
  const service = getPlatformService();
  // Uses the singleton Supabase client from @/lib/supabase

  const {
    days = 7,
    force = false,
    metrics = [
      'steps',
      'heart_rate',
      'resting_heart_rate',
      'sleep',
      'spo2',
      'active_energy',
    ],
  } = options;

  // Check if service is available
  if (!(await service.isAvailable())) {
    return {
      synced: 0,
      failed: 0,
      lastSyncISO: new Date().toISOString(),
      errors: ['Wearable service not available on this device'],
    };
  }

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  const startISO = startDate.toISOString().split('T')[0];
  const endISO = endDate.toISOString().split('T')[0];

  const dateRange: DateRange = { startISO, endISO };
  const errors: string[] = [];
  const dailySummaries: Map<string, DailyWearableSummary> = new Map();

  // Fetch each metric
  try {
    if (metrics.includes('steps')) {
      const steps = await service.getSteps(dateRange);
      for (const s of steps) {
        const date = s.timestamp.split('T')[0];
        const summary = dailySummaries.get(date) || {
          date,
          source: service.getDataSource(),
        };
        summary.steps = s.steps;
        dailySummaries.set(date, summary);
      }
    }
  } catch (err) {
    errors.push(`Failed to fetch steps: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    if (metrics.includes('heart_rate')) {
      const heartRates = await service.getHeartRate(dateRange);
      const byDate = new Map<string, number[]>();
      for (const hr of heartRates) {
        const date = hr.timestamp.split('T')[0];
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date)!.push(hr.bpm);
      }
      for (const [date, bpms] of byDate.entries()) {
        const summary = dailySummaries.get(date) || {
          date,
          source: service.getDataSource(),
        };
        summary.avgHeartRate =
          bpms.reduce((a, b) => a + b, 0) / bpms.length;
        dailySummaries.set(date, summary);
      }
    }
  } catch (err) {
    errors.push(
      `Failed to fetch heart rate: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    if (metrics.includes('resting_heart_rate')) {
      const restingHR = await service.getRestingHeartRate(dateRange);
      for (const rhr of restingHR) {
        const date = rhr.timestamp.split('T')[0];
        const summary = dailySummaries.get(date) || {
          date,
          source: service.getDataSource(),
        };
        summary.restingHeartRate = rhr.bpm;
        dailySummaries.set(date, summary);
      }
    }
  } catch (err) {
    errors.push(
      `Failed to fetch resting heart rate: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    if (metrics.includes('sleep')) {
      const sleepSessions = await service.getSleep(dateRange);
      const byDate = new Map<
        string,
        { durations: number[]; qualities: string[] }
      >();
      for (const sleep of sleepSessions) {
        const date = sleep.startISO.split('T')[0];
        if (!byDate.has(date)) {
          byDate.set(date, { durations: [], qualities: [] });
        }
        const entry = byDate.get(date)!;
        entry.durations.push(sleep.durationMinutes);
      }
      for (const [date, { durations }] of byDate.entries()) {
        const summary = dailySummaries.get(date) || {
          date,
          source: service.getDataSource(),
        };
        summary.sleepDurationMinutes = durations.reduce((a, b) => a + b, 0);
        // Simple sleep quality heuristic: 7-9 hours = good, >9 = excellent, <5 = poor
        const hours = summary.sleepDurationMinutes! / 60;
        if (hours >= 7 && hours <= 9) summary.sleepQuality = 'good';
        else if (hours > 9) summary.sleepQuality = 'excellent';
        else if (hours < 5) summary.sleepQuality = 'poor';
        else summary.sleepQuality = 'fair';
        dailySummaries.set(date, summary);
      }
    }
  } catch (err) {
    errors.push(
      `Failed to fetch sleep: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    if (metrics.includes('spo2')) {
      const spo2Values = await service.getSpO2(dateRange);
      const byDate = new Map<string, number[]>();
      for (const spo2 of spo2Values) {
        const date = spo2.timestamp.split('T')[0];
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date)!.push(spo2.percentage);
      }
      for (const [date, percentages] of byDate.entries()) {
        const summary = dailySummaries.get(date) || {
          date,
          source: service.getDataSource(),
        };
        summary.avgSpO2 =
          percentages.reduce((a, b) => a + b, 0) / percentages.length;
        dailySummaries.set(date, summary);
      }
    }
  } catch (err) {
    errors.push(
      `Failed to fetch SpO2: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    if (metrics.includes('active_energy')) {
      const energy = await service.getActiveEnergy(dateRange);
      const byDate = new Map<string, number>();
      for (const e of energy) {
        const date = e.timestamp.split('T')[0];
        byDate.set(date, (byDate.get(date) || 0) + e.kcal);
      }
      for (const [date, kcal] of byDate.entries()) {
        const summary = dailySummaries.get(date) || {
          date,
          source: service.getDataSource(),
        };
        summary.activeEnergyKcal = kcal;
        dailySummaries.set(date, summary);
      }
    }
  } catch (err) {
    errors.push(
      `Failed to fetch active energy: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Upsert into Supabase
  let synced = 0;
  let failed = 0;

  for (const summary of dailySummaries.values()) {
    try {
      const { error } = await supabase.from('wearable_data').upsert(
        {
          date: summary.date,
          steps: summary.steps,
          avg_heart_rate: summary.avgHeartRate,
          resting_heart_rate: summary.restingHeartRate,
          sleep_duration_minutes: summary.sleepDurationMinutes,
          sleep_quality: summary.sleepQuality,
          active_energy_kcal: summary.activeEnergyKcal,
          avg_spo2: summary.avgSpO2,
          source: summary.source,
          synced_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,date,source',
        }
      );

      if (error) {
        errors.push(`Failed to upsert ${summary.date}: ${error.message}`);
        failed++;
      } else {
        synced++;
      }
    } catch (err) {
      errors.push(
        `Exception syncing ${summary.date}: ${err instanceof Error ? err.message : String(err)}`
      );
      failed++;
    }
  }

  return {
    synced,
    failed,
    lastSyncISO: new Date().toISOString(),
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Clear the platform service cache (useful for testing or re-initialization)
 */
export function clearWearableServiceCache(): void {
  _wearableService = null;
}
