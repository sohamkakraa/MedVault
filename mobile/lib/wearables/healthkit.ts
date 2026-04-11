/**
 * UMA Mobile — HealthKit Integration (iOS)
 *
 * Implementation of the WearableService interface using Apple's HealthKit.
 * Uses the react-native-health library to request permissions and fetch data.
 *
 * HealthKit sample types used:
 * - HKQuantityTypeIdentifierStepCount (steps)
 * - HKQuantityTypeIdentifierHeartRate (bpm)
 * - HKQuantityTypeIdentifierRestingHeartRate (bpm)
 * - HKCategoryTypeIdentifierSleepAnalysis (sleep sessions)
 * - HKQuantityTypeIdentifierOxygenSaturation (SpO2 %)
 * - HKQuantityTypeIdentifierActiveEnergyBurned (kcal)
 * - HKQuantityTypeIdentifierDistanceWalkingRunning (m)
 * - HKQuantityTypeIdentifierFlightsClimbed (count)
 * - HKQuantityTypeIdentifierBodyTemperature (Celsius)
 *
 * Permission flow:
 * 1. requestPermissions() → prompts user in native iOS sheet
 * 2. User grants/denies in HealthKit app
 * 3. hasPermission() checks if permission was granted
 * 4. get*() fetches data if permission exists
 */

import AppleHealthKit, {
  HKQuantityTypeIdentifier,
  HKCategoryTypeIdentifier,
  HealthKitPermissions,
  HealthValue,
  HKSampleType,
} from 'react-native-health';

import {
  WearableService,
  MetricType,
  PermissionScope,
  PermissionResult,
  DateRange,
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

/**
 * HealthKit implementation of WearableService
 */
export class HealthKitService implements WearableService {
  private grantedPermissions = new Set<MetricType>();

  constructor() {
    this.checkExistingPermissions();
  }

  /**
   * Check which permissions are already granted
   */
  private async checkExistingPermissions(): Promise<void> {
    // This is a best-effort check; we don't have perfect permission introspection
    // in react-native-health, so we rely on catching errors during requests
    try {
      await AppleHealthKit.getAuthStatus(
        [HKQuantityTypeIdentifier.stepCount],
        (err, authorized) => {
          if (!err && authorized) {
            this.grantedPermissions.add('steps');
          }
        }
      );
    } catch {
      // Permission check failed; will ask on first use
    }
  }

  /**
   * Convert MetricType to HealthKit sample type identifier
   */
  private metricToHKType(metric: MetricType): HKQuantityTypeIdentifier | HKCategoryTypeIdentifier {
    switch (metric) {
      case 'steps':
        return HKQuantityTypeIdentifier.stepCount;
      case 'heart_rate':
        return HKQuantityTypeIdentifier.heartRate;
      case 'resting_heart_rate':
        return HKQuantityTypeIdentifier.restingHeartRate;
      case 'sleep':
        return HKCategoryTypeIdentifier.sleepAnalysis;
      case 'spo2':
        return HKQuantityTypeIdentifier.oxygenSaturation;
      case 'active_energy':
        return HKQuantityTypeIdentifier.activeEnergyBurned;
      case 'distance':
        return HKQuantityTypeIdentifier.distanceWalkingRunning;
      case 'flights_climbed':
        return HKQuantityTypeIdentifier.flightsClimbed;
      case 'temperature':
        return HKQuantityTypeIdentifier.bodyTemperature;
      default:
        throw new Error(`Unsupported metric: ${metric}`);
    }
  }

  /**
   * Request permissions for the given metrics
   */
  async requestPermissions(
    metrics: MetricType[],
    scope: PermissionScope = 'read'
  ): Promise<PermissionResult[]> {
    const results: PermissionResult[] = [];

    // Build permission objects for HealthKit
    const permissions: HealthKitPermissions = {
      permissions: {
        read: metrics.map((m) => this.metricToHKType(m) as string),
        write: scope === 'write' ? metrics.map((m) => this.metricToHKType(m) as string) : [],
      },
    };

    return new Promise((resolve) => {
      AppleHealthKit.requestAuthorizationToShare(
        permissions.permissions.read as HKSampleType[],
        scope === 'write'
          ? (permissions.permissions.write as HKSampleType[])
          : [],
        (err) => {
          if (!err) {
            // Assume all requested were granted (HealthKit doesn't give granular results)
            for (const metric of metrics) {
              this.grantedPermissions.add(metric);
              results.push({
                metric,
                granted: true,
                scope,
              });
            }
          } else {
            // Request denied or failed
            for (const metric of metrics) {
              results.push({
                metric,
                granted: false,
                scope,
                reason: err.message || 'Permission denied',
              });
            }
          }
          resolve(results);
        }
      );
    });
  }

  /**
   * Check if permission is already granted
   */
  async hasPermission(metric: MetricType): Promise<boolean> {
    return this.grantedPermissions.has(metric);
  }

  /**
   * Fetch step count data
   */
  async getSteps(dateRange: DateRange): Promise<StepData[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    return new Promise((resolve, reject) => {
      AppleHealthKit.getStepCount(
        {
          startDate,
          endDate,
          period: 86400000, // 1 day in ms
        },
        (err, results: HealthValue[]) => {
          if (err) {
            reject(new Error(`Failed to fetch steps: ${err.message}`));
          } else {
            const data: StepData[] = (results || []).map((r) => ({
              timestamp: new Date(r.startDate).toISOString(),
              steps: Math.round(r.value),
              source: 'apple_health',
            }));
            resolve(data);
          }
        }
      );
    });
  }

  /**
   * Fetch heart rate data
   */
  async getHeartRate(dateRange: DateRange): Promise<HeartRateData[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    return new Promise((resolve, reject) => {
      AppleHealthKit.getHeartRateSamples(
        {
          startDate,
          endDate,
        },
        (err, results: HealthValue[]) => {
          if (err) {
            reject(new Error(`Failed to fetch heart rate: ${err.message}`));
          } else {
            const data: HeartRateData[] = (results || []).map((r) => ({
              timestamp: new Date(r.startDate).toISOString(),
              bpm: Math.round(r.value),
              source: 'apple_health',
            }));
            resolve(data);
          }
        }
      );
    });
  }

  /**
   * Fetch resting heart rate
   */
  async getRestingHeartRate(dateRange: DateRange): Promise<RestingHeartRateData[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    return new Promise((resolve, reject) => {
      AppleHealthKit.getRestingHeartRateSamples(
        {
          startDate,
          endDate,
        },
        (err, results: HealthValue[]) => {
          if (err) {
            reject(new Error(`Failed to fetch resting heart rate: ${err.message}`));
          } else {
            const data: RestingHeartRateData[] = (results || []).map((r) => ({
              timestamp: new Date(r.startDate).toISOString(),
              bpm: Math.round(r.value),
              source: 'apple_health',
            }));
            resolve(data);
          }
        }
      );
    });
  }

  /**
   * Fetch sleep data
   */
  async getSleep(dateRange: DateRange): Promise<SleepData[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    return new Promise((resolve, reject) => {
      AppleHealthKit.getSleepSamples(
        {
          startDate,
          endDate,
        },
        (err, results: HealthValue[]) => {
          if (err) {
            reject(new Error(`Failed to fetch sleep: ${err.message}`));
          } else {
            const data: SleepData[] = (results || []).map((r) => ({
              startISO: new Date(r.startDate).toISOString(),
              endISO: new Date(r.endDate).toISOString(),
              durationMinutes: Math.round(
                (r.endDate.getTime() - r.startDate.getTime()) / 60000
              ),
              source: 'apple_health',
              // Stage data not available in react-native-health basic API
            }));
            resolve(data);
          }
        }
      );
    });
  }

  /**
   * Fetch SpO2 (oxygen saturation) data
   */
  async getSpO2(dateRange: DateRange): Promise<SpO2Data[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    return new Promise((resolve, reject) => {
      AppleHealthKit.getOxygenSaturationSamples(
        {
          startDate,
          endDate,
        },
        (err, results: HealthValue[]) => {
          if (err) {
            reject(new Error(`Failed to fetch SpO2: ${err.message}`));
          } else {
            const data: SpO2Data[] = (results || []).map((r) => ({
              timestamp: new Date(r.startDate).toISOString(),
              percentage: Math.round(r.value * 100) / 100, // Convert to percentage
              source: 'apple_health',
            }));
            resolve(data);
          }
        }
      );
    });
  }

  /**
   * Fetch active energy (exercise calories)
   */
  async getActiveEnergy(dateRange: DateRange): Promise<ActiveEnergyData[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    return new Promise((resolve, reject) => {
      AppleHealthKit.getActiveEnergyBurned(
        {
          startDate,
          endDate,
          period: 86400000, // 1 day
        },
        (err, results: HealthValue[]) => {
          if (err) {
            reject(new Error(`Failed to fetch active energy: ${err.message}`));
          } else {
            const data: ActiveEnergyData[] = (results || []).map((r) => ({
              timestamp: new Date(r.startDate).toISOString(),
              kcal: Math.round(r.value),
              source: 'apple_health',
            }));
            resolve(data);
          }
        }
      );
    });
  }

  /**
   * Fetch distance walked/run
   */
  async getDistance(dateRange: DateRange): Promise<DistanceData[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    return new Promise((resolve, reject) => {
      AppleHealthKit.getDistanceWalkingRunning(
        {
          startDate,
          endDate,
          period: 86400000, // 1 day
        },
        (err, results: HealthValue[]) => {
          if (err) {
            reject(new Error(`Failed to fetch distance: ${err.message}`));
          } else {
            const data: DistanceData[] = (results || []).map((r) => ({
              timestamp: new Date(r.startDate).toISOString(),
              meters: Math.round(r.value),
              source: 'apple_health',
            }));
            resolve(data);
          }
        }
      );
    });
  }

  /**
   * Fetch flights climbed
   */
  async getFlightsClimbed(dateRange: DateRange): Promise<FlightsClimbedData[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    return new Promise((resolve, reject) => {
      AppleHealthKit.getFlightsClimbed(
        {
          startDate,
          endDate,
          period: 86400000, // 1 day
        },
        (err, results: HealthValue[]) => {
          if (err) {
            reject(new Error(`Failed to fetch flights climbed: ${err.message}`));
          } else {
            const data: FlightsClimbedData[] = (results || []).map((r) => ({
              timestamp: new Date(r.startDate).toISOString(),
              flights: Math.round(r.value),
              source: 'apple_health',
            }));
            resolve(data);
          }
        }
      );
    });
  }

  /**
   * Fetch body temperature
   */
  async getTemperature(dateRange: DateRange): Promise<TemperatureData[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    return new Promise((resolve, reject) => {
      AppleHealthKit.getBodyTemperatureSamples(
        {
          startDate,
          endDate,
        },
        (err, results: HealthValue[]) => {
          if (err) {
            reject(new Error(`Failed to fetch temperature: ${err.message}`));
          } else {
            const data: TemperatureData[] = (results || []).map((r) => ({
              timestamp: new Date(r.startDate).toISOString(),
              celsius: Math.round(r.value * 100) / 100,
              source: 'apple_health',
            }));
            resolve(data);
          }
        }
      );
    });
  }

  /**
   * Subscribe to realtime data updates
   * Not implemented for HealthKit (would require background observers)
   */
  async subscribeToRealtime(metric: MetricType, callback: (data: any) => void) {
    console.warn(
      'Real-time subscriptions not yet implemented for HealthKit. Use periodic polling instead.'
    );
    return {
      unsubscribe: () => {},
    };
  }

  /**
   * Check if HealthKit is available (always true on iOS)
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Return the data source identifier
   */
  getDataSource(): 'apple_health' | 'health_connect' | 'unsupported' {
    return 'apple_health';
  }
}
