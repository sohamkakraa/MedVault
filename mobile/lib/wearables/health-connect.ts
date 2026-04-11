/**
 * UMA Mobile — Health Connect Integration (Android)
 *
 * Implementation of the WearableService interface using Google's Health Connect.
 * Uses the react-native-health-connect library to request permissions and fetch data.
 *
 * Health Connect record types used:
 * - Steps (stepsRecord)
 * - Heart Rate (heartRateRecord)
 * - Sleep (sleepSessionRecord)
 * - Oxygen Saturation / SpO2 (oxygenSaturationRecord)
 * - Total Energy Burned (totalEnergyBurnedRecord)
 * - Distance (distanceRecord)
 * - Floors Climbed (floorsClimbedRecord)
 * - Body Temperature (bodyTemperatureRecord)
 *
 * Permission flow:
 * 1. requestPermissions() → Health Connect app decides (user may not see prompt)
 * 2. If granted, we can read data; if denied, calls return empty
 * 3. hasPermission() checks if permission was granted
 * 4. get*() fetches data if available
 */

import {
  HealthConnectClient,
  RecordType,
  TimeRangeFilter,
} from 'react-native-health-connect';

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
  RealtimeCallback,
  RealtimeSubscription,
} from './types';

/**
 * Health Connect implementation of WearableService
 */
export class HealthConnectService implements WearableService {
  private client: HealthConnectClient;
  private grantedPermissions = new Set<MetricType>();

  constructor() {
    this.client = new HealthConnectClient();
    this.checkExistingPermissions();
  }

  /**
   * Check which permissions are already granted
   */
  private async checkExistingPermissions(): Promise<void> {
    try {
      const permissions = await this.client.getGrantedPermissions();
      // Map granted Health Connect permissions to our MetricType
      if (permissions.includes(RecordType.STEPS)) {
        this.grantedPermissions.add('steps');
      }
      if (permissions.includes(RecordType.HEART_RATE)) {
        this.grantedPermissions.add('heart_rate');
      }
      if (permissions.includes(RecordType.SLEEP_SESSION)) {
        this.grantedPermissions.add('sleep');
      }
      if (permissions.includes(RecordType.OXYGEN_SATURATION)) {
        this.grantedPermissions.add('spo2');
      }
      if (permissions.includes(RecordType.TOTAL_ENERGY_BURNED)) {
        this.grantedPermissions.add('active_energy');
      }
      if (permissions.includes(RecordType.DISTANCE)) {
        this.grantedPermissions.add('distance');
      }
      if (permissions.includes(RecordType.FLOORS_CLIMBED)) {
        this.grantedPermissions.add('flights_climbed');
      }
      if (permissions.includes(RecordType.BODY_TEMPERATURE)) {
        this.grantedPermissions.add('temperature');
      }
    } catch (err) {
      // Health Connect may not be available or permission check failed
      console.warn('Failed to check Health Connect permissions:', err);
    }
  }

  /**
   * Convert MetricType to Health Connect RecordType
   */
  private metricToHealthConnectType(metric: MetricType): RecordType {
    switch (metric) {
      case 'steps':
        return RecordType.STEPS;
      case 'heart_rate':
        return RecordType.HEART_RATE;
      case 'resting_heart_rate':
        return RecordType.RESTING_HEART_RATE;
      case 'sleep':
        return RecordType.SLEEP_SESSION;
      case 'spo2':
        return RecordType.OXYGEN_SATURATION;
      case 'active_energy':
        return RecordType.TOTAL_ENERGY_BURNED;
      case 'distance':
        return RecordType.DISTANCE;
      case 'flights_climbed':
        return RecordType.FLOORS_CLIMBED;
      case 'temperature':
        return RecordType.BODY_TEMPERATURE;
      default:
        throw new Error(`Unsupported metric: ${metric}`);
    }
  }

  /**
   * Request permissions for the given metrics
   * Health Connect handles the permission UI; we just request and check
   */
  async requestPermissions(
    metrics: MetricType[],
    scope: PermissionScope = 'read'
  ): Promise<PermissionResult[]> {
    const results: PermissionResult[] = [];
    const recordTypes = metrics.map((m) => this.metricToHealthConnectType(m));

    try {
      // Request permissions in Health Connect
      await this.client.requestPermission(recordTypes);

      // Get granted permissions to see what was actually granted
      const granted = await this.client.getGrantedPermissions();

      for (const metric of metrics) {
        const recordType = this.metricToHealthConnectType(metric);
        const isGranted = granted.includes(recordType);
        if (isGranted) {
          this.grantedPermissions.add(metric);
        }
        results.push({
          metric,
          granted: isGranted,
          scope,
          reason: isGranted ? undefined : 'Permission not granted by user',
        });
      }
    } catch (err) {
      // Request failed (Health Connect not available, etc.)
      for (const metric of metrics) {
        results.push({
          metric,
          granted: false,
          scope,
          reason: err instanceof Error ? err.message : 'Permission request failed',
        });
      }
    }

    return results;
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

    try {
      const response = await this.client.readRecords(RecordType.STEPS, {
        timeRangeFilter: {
          operator: 'between',
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        },
      });

      const data: StepData[] = (response.records || []).map((record: any) => ({
        timestamp: record.startTime || new Date(record.time).toISOString(),
        steps: record.count || 0,
        source: 'health_connect',
      }));

      return data;
    } catch (err) {
      console.warn('Failed to fetch steps:', err);
      return [];
    }
  }

  /**
   * Fetch heart rate data
   */
  async getHeartRate(dateRange: DateRange): Promise<HeartRateData[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    try {
      const response = await this.client.readRecords(RecordType.HEART_RATE, {
        timeRangeFilter: {
          operator: 'between',
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        },
      });

      const data: HeartRateData[] = (response.records || []).map((record: any) => ({
        timestamp: record.time || new Date().toISOString(),
        bpm: record.beatsPerMinute || 0,
        source: 'health_connect',
      }));

      return data;
    } catch (err) {
      console.warn('Failed to fetch heart rate:', err);
      return [];
    }
  }

  /**
   * Fetch resting heart rate
   */
  async getRestingHeartRate(dateRange: DateRange): Promise<RestingHeartRateData[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    try {
      const response = await this.client.readRecords(RecordType.RESTING_HEART_RATE, {
        timeRangeFilter: {
          operator: 'between',
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        },
      });

      const data: RestingHeartRateData[] = (response.records || []).map((record: any) => ({
        timestamp: record.time || new Date().toISOString(),
        bpm: record.beatsPerMinute || 0,
        source: 'health_connect',
      }));

      return data;
    } catch (err) {
      console.warn('Failed to fetch resting heart rate:', err);
      return [];
    }
  }

  /**
   * Fetch sleep data
   */
  async getSleep(dateRange: DateRange): Promise<SleepData[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    try {
      const response = await this.client.readRecords(RecordType.SLEEP_SESSION, {
        timeRangeFilter: {
          operator: 'between',
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        },
      });

      const data: SleepData[] = (response.records || []).map((record: any) => {
        const startTime = new Date(record.startTime);
        const endTime = new Date(record.endTime);
        const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000;

        return {
          startISO: startTime.toISOString(),
          endISO: endTime.toISOString(),
          durationMinutes: Math.round(durationMinutes),
          stages: record.stages
            ? {
                deep: record.stages.deep || 0,
                light: record.stages.light || 0,
                rem: record.stages.rem || 0,
                awake: record.stages.awake || 0,
              }
            : undefined,
          source: 'health_connect',
        };
      });

      return data;
    } catch (err) {
      console.warn('Failed to fetch sleep:', err);
      return [];
    }
  }

  /**
   * Fetch SpO2 (oxygen saturation) data
   */
  async getSpO2(dateRange: DateRange): Promise<SpO2Data[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    try {
      const response = await this.client.readRecords(RecordType.OXYGEN_SATURATION, {
        timeRangeFilter: {
          operator: 'between',
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        },
      });

      const data: SpO2Data[] = (response.records || []).map((record: any) => ({
        timestamp: record.time || new Date().toISOString(),
        percentage: record.percentage || 0,
        source: 'health_connect',
      }));

      return data;
    } catch (err) {
      console.warn('Failed to fetch SpO2:', err);
      return [];
    }
  }

  /**
   * Fetch active energy burned
   */
  async getActiveEnergy(dateRange: DateRange): Promise<ActiveEnergyData[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    try {
      const response = await this.client.readRecords(RecordType.TOTAL_ENERGY_BURNED, {
        timeRangeFilter: {
          operator: 'between',
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        },
      });

      const data: ActiveEnergyData[] = (response.records || []).map((record: any) => ({
        timestamp: record.startTime || new Date().toISOString(),
        kcal: record.energy || 0,
        source: 'health_connect',
      }));

      return data;
    } catch (err) {
      console.warn('Failed to fetch active energy:', err);
      return [];
    }
  }

  /**
   * Fetch distance walked/run
   */
  async getDistance(dateRange: DateRange): Promise<DistanceData[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    try {
      const response = await this.client.readRecords(RecordType.DISTANCE, {
        timeRangeFilter: {
          operator: 'between',
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        },
      });

      const data: DistanceData[] = (response.records || []).map((record: any) => ({
        timestamp: record.startTime || new Date().toISOString(),
        meters: record.distance || 0,
        source: 'health_connect',
      }));

      return data;
    } catch (err) {
      console.warn('Failed to fetch distance:', err);
      return [];
    }
  }

  /**
   * Fetch flights (floors) climbed
   */
  async getFlightsClimbed(dateRange: DateRange): Promise<FlightsClimbedData[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    try {
      const response = await this.client.readRecords(RecordType.FLOORS_CLIMBED, {
        timeRangeFilter: {
          operator: 'between',
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        },
      });

      const data: FlightsClimbedData[] = (response.records || []).map((record: any) => ({
        timestamp: record.startTime || new Date().toISOString(),
        flights: record.floors || 0,
        source: 'health_connect',
      }));

      return data;
    } catch (err) {
      console.warn('Failed to fetch flights climbed:', err);
      return [];
    }
  }

  /**
   * Fetch body temperature
   */
  async getTemperature(dateRange: DateRange): Promise<TemperatureData[]> {
    const { startISO, endISO } = dateRange;
    const startDate = new Date(startISO);
    const endDate = new Date(endISO);

    try {
      const response = await this.client.readRecords(RecordType.BODY_TEMPERATURE, {
        timeRangeFilter: {
          operator: 'between',
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        },
      });

      const data: TemperatureData[] = (response.records || []).map((record: any) => ({
        timestamp: record.time || new Date().toISOString(),
        celsius: record.temperature || 0,
        source: 'health_connect',
      }));

      return data;
    } catch (err) {
      console.warn('Failed to fetch temperature:', err);
      return [];
    }
  }

  /**
   * Subscribe to realtime data updates via Health Connect Passive API
   * Requires the passive_data_updates_client permission in manifest
   */
  async subscribeToRealtime(
    metric: MetricType,
    callback: RealtimeCallback
  ): Promise<RealtimeSubscription> {
    const recordType = this.metricToHealthConnectType(metric);

    // This is a placeholder; real implementation would use PassiveDataUpdatesClient
    // in native Android code, as it requires native setup
    console.warn(
      'Real-time subscriptions require native Android setup. Use periodic polling instead.'
    );

    return {
      unsubscribe: () => {},
    };
  }

  /**
   * Check if Health Connect is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.getGrantedPermissions();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Return the data source identifier
   */
  getDataSource(): 'apple_health' | 'health_connect' | 'unsupported' {
    return 'health_connect';
  }
}
