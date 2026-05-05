// AccessoryRectangularView.swift — accessoryRectangular (Lock Screen) widget

import WidgetKit
import SwiftUI
import UMAShared

struct AccessoryRectangularView: View {
    let entry: UMAWidgetEntry

    var body: some View {
        HStack(spacing: 10) {
            metricIcon
            metricContent
            Spacer()
        }
        .widgetURL(URL(string: "uma://today"))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessLabel)
    }

    @ViewBuilder
    private var metricIcon: some View {
        switch entry.configuration.metric {
        case .nextDose:
            Image(systemName: "pills.circle.fill")
                .font(.title2)
                .foregroundStyle(.tint)
        case .latestBP:
            Image(systemName: "heart.fill")
                .font(.title2)
                .foregroundStyle(.red)
        case .hbA1c:
            Image(systemName: "waveform.path.ecg")
                .font(.title2)
                .foregroundStyle(.tint)
        case .stepCount:
            Image(systemName: "figure.walk")
                .font(.title2)
                .foregroundStyle(.tint)
        case .notificationCount:
            Image(systemName: "bell.badge.fill")
                .font(.title2)
                .foregroundStyle(.orange)
        }
    }

    @ViewBuilder
    private var metricContent: some View {
        switch entry.configuration.metric {
        case .nextDose:
            if let dose = entry.nextDose {
                VStack(alignment: .leading, spacing: 2) {
                    Text(dose.medicationName)
                        .font(.headline)
                        .lineLimit(1)
                    HStack(spacing: 4) {
                        if let doseAmt = dose.dose {
                            Text(doseAmt)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        if let time = dose.scheduledTime {
                            Text(time, style: .time)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.tint)
                        }
                    }
                }
            } else {
                Text("All done today")
                    .font(.headline)
                    .foregroundStyle(.green)
            }

        case .latestBP:
            let sys = entry.store?.latestLab(named: "Systolic BP")?.value
            let dia = entry.store?.latestLab(named: "Diastolic BP")?.value
            if let s = sys, let d = dia {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Blood Pressure")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(Int(s))/\(Int(d)) mmHg")
                        .font(.headline)
                }
            } else {
                Text("No BP data")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

        case .hbA1c:
            if let hba1c = entry.store?.latestLab(named: "HbA1c") {
                VStack(alignment: .leading, spacing: 2) {
                    Text("HbA1c")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(String(format: "%.1f%%", hba1c.value))
                        .font(.headline)
                }
            } else {
                Text("No HbA1c data")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

        case .stepCount:
            VStack(alignment: .leading, spacing: 2) {
                Text("Steps")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("Open UMA")
                    .font(.headline)
            }

        case .notificationCount:
            VStack(alignment: .leading, spacing: 2) {
                Text("Alerts")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("Open UMA")
                    .font(.headline)
            }
        }
    }

    private var accessLabel: String {
        switch entry.configuration.metric {
        case .nextDose:
            return entry.nextDose.map { "\($0.medicationName), \($0.dose ?? "")" } ?? "All doses taken"
        case .latestBP:
            let s = entry.store?.latestLab(named: "Systolic BP")?.value
            let d = entry.store?.latestLab(named: "Diastolic BP")?.value
            return s.flatMap { sv in d.map { dv in "Blood pressure: \(Int(sv)) over \(Int(dv))" } } ?? "No BP data"
        case .hbA1c:
            return entry.store?.latestLab(named: "HbA1c").map { "HbA1c: \(String(format: "%.1f", $0.value)) percent" } ?? "No HbA1c"
        case .stepCount:
            return "Step count"
        case .notificationCount:
            return "Notifications"
        }
    }
}
