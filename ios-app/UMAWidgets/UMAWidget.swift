// UMAWidget.swift — WidgetKit widget supporting all 5 families

import WidgetKit
import SwiftUI
import UMAShared

// MARK: - Timeline Entry

struct UMAWidgetEntry: TimelineEntry {
    let date: Date
    let store: PatientStore?
    let configuration: UMAWidgetConfigurationIntent
    let nextDose: DoseSchedule?
}

// MARK: - Timeline Provider

struct UMAWidgetProvider: AppIntentTimelineProvider {
    typealias Entry = UMAWidgetEntry
    typealias Intent = UMAWidgetConfigurationIntent

    func placeholder(in context: Context) -> UMAWidgetEntry {
        UMAWidgetEntry(
            date: Date(),
            store: placeholderStore(),
            configuration: UMAWidgetConfigurationIntent(),
            nextDose: placeholderDose()
        )
    }

    func snapshot(for configuration: UMAWidgetConfigurationIntent, in context: Context) async -> UMAWidgetEntry {
        let store = await AppGroupStore.shared.readStore()
        let doses = await AppGroupStore.shared.readDoseSchedules()
        return UMAWidgetEntry(
            date: Date(),
            store: store,
            configuration: configuration,
            nextDose: doses.first { $0.status == .pending }
        )
    }

    func timeline(for configuration: UMAWidgetConfigurationIntent, in context: Context) async -> Timeline<UMAWidgetEntry> {
        let store = await AppGroupStore.shared.readStore()
        let doses = await AppGroupStore.shared.readDoseSchedules()
        let nextDose = doses.first { $0.status == .pending }

        let entry = UMAWidgetEntry(
            date: Date(),
            store: store,
            configuration: configuration,
            nextDose: nextDose
        )

        // Refresh every 15 minutes, or at the next dose time if sooner
        var refreshDate = Date().addingTimeInterval(900)
        if let doseTime = nextDose?.scheduledTime, doseTime > Date() {
            refreshDate = min(refreshDate, doseTime)
        }

        return Timeline(entries: [entry], policy: .after(refreshDate))
    }

    private func placeholderStore() -> PatientStore {
        var store = PatientStore()
        store.profile.name = "Your Name"
        store.labs = [
            ExtractedLab(name: "HbA1c", value: 6.8, unit: "%", dateISO: "2025-01-01T00:00:00Z"),
            ExtractedLab(name: "Systolic BP", value: 122, unit: "mmHg", dateISO: "2025-01-01T00:00:00Z"),
            ExtractedLab(name: "Diastolic BP", value: 78, unit: "mmHg", dateISO: "2025-01-01T00:00:00Z")
        ]
        store.meds = [ExtractedMedication(name: "Metformin", dose: "500mg", frequency: "Once daily")]
        return store
    }

    private func placeholderDose() -> DoseSchedule {
        DoseSchedule(
            medicationId: "placeholder",
            medicationName: "Metformin",
            dose: "500mg",
            scheduledTimeISO: ISO8601DateFormatter().string(from: Calendar.current.date(bySettingHour: 8, minute: 0, second: 0, of: Date())!)
        )
    }
}

// MARK: - Widget Declaration

struct UMAWidget: Widget {
    let kind = "UMAWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: UMAWidgetConfigurationIntent.self,
            provider: UMAWidgetProvider()
        ) { entry in
            UMAWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("UMA Health")
        .description("Your key health metrics at a glance.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .systemLarge,
            .accessoryCircular,
            .accessoryRectangular
        ])
    }
}

// MARK: - Entry View Router

struct UMAWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: UMAWidgetEntry

    var body: some View {
        switch family {
        case .systemSmall:
            SmallWidgetView(entry: entry)
        case .systemMedium:
            MediumWidgetView(entry: entry)
        case .systemLarge:
            LargeWidgetView(entry: entry)
        case .accessoryCircular:
            AccessoryCircularView(entry: entry)
        case .accessoryRectangular:
            AccessoryRectangularView(entry: entry)
        default:
            SmallWidgetView(entry: entry)
        }
    }
}
