// WidgetConfigurationIntent.swift — AppIntents-based widget configuration

import AppIntents
import WidgetKit

/// Metric types the user can pick in the widget configuration picker.
enum WidgetMetric: String, AppEnum {
    case nextDose = "Next Dose"
    case latestBP = "Latest BP"
    case hbA1c = "HbA1c"
    case stepCount = "Step Count"
    case notificationCount = "Notification Count"

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Health Metric")
    }

    static var caseDisplayRepresentations: [WidgetMetric: DisplayRepresentation] {
        [
            .nextDose: DisplayRepresentation(
                title: "Next Dose",
                subtitle: "Upcoming medication",
                image: .init(systemName: "pills.circle")
            ),
            .latestBP: DisplayRepresentation(
                title: "Latest Blood Pressure",
                subtitle: "Most recent BP reading",
                image: .init(systemName: "heart.fill")
            ),
            .hbA1c: DisplayRepresentation(
                title: "HbA1c",
                subtitle: "Glycated haemoglobin trend",
                image: .init(systemName: "waveform.path.ecg")
            ),
            .stepCount: DisplayRepresentation(
                title: "Step Count",
                subtitle: "Today's steps",
                image: .init(systemName: "figure.walk")
            ),
            .notificationCount: DisplayRepresentation(
                title: "Notifications",
                subtitle: "Pending alerts",
                image: .init(systemName: "bell.badge")
            )
        ]
    }
}

/// AppIntent-based configuration for UMA widgets.
struct UMAWidgetConfigurationIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "UMA Health Metric"
    static var description = IntentDescription("Choose which health metric to display.")

    @Parameter(title: "Metric", default: .nextDose)
    var metric: WidgetMetric
}
