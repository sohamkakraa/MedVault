// SmallWidgetView.swift — systemSmall widget

import WidgetKit
import SwiftUI
import UMAShared

struct SmallWidgetView: View {
    let entry: UMAWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header
            HStack(spacing: 4) {
                Image(systemName: metricIcon)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tint)
                Text("UMA")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
            }

            Spacer()

            // Primary metric
            metricContent

            Spacer()

            // Footer
            Text(entry.date, style: .time)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .widgetURL(URL(string: "uma://today"))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
    }

    @ViewBuilder
    private var metricContent: some View {
        switch entry.configuration.metric {
        case .nextDose:
            nextDoseContent
        case .latestBP:
            bpContent
        case .hbA1c:
            hba1cContent
        case .stepCount:
            stepContent
        case .notificationCount:
            notifContent
        }
    }

    private var nextDoseContent: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let dose = entry.nextDose {
                Text(dose.medicationName)
                    .font(.headline)
                    .lineLimit(1)
                if let doseAmt = dose.dose {
                    Text(doseAmt)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                if let time = dose.scheduledTime {
                    Text(time, style: .time)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tint)
                }
            } else {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title)
                    .foregroundStyle(.green)
                Text("All done!")
                    .font(.headline)
            }
        }
    }

    private var bpContent: some View {
        VStack(alignment: .leading, spacing: 4) {
            let sys = entry.store?.latestLab(named: "Systolic BP")
            let dia = entry.store?.latestLab(named: "Diastolic BP")
            if let s = sys, let d = dia {
                Text("\(Int(s.value))/\(Int(d.value))")
                    .font(.title2.weight(.bold))
                Text("mmHg")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Image(systemName: "heart.slash")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Text("No BP data")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var hba1cContent: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let lab = entry.store?.latestLab(named: "HbA1c") {
                Text(String(format: "%.1f%%", lab.value))
                    .font(.title2.weight(.bold))
                Text("HbA1c")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Image(systemName: "waveform.path.ecg.rectangle")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Text("No data")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var stepContent: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "figure.walk")
                .font(.title2)
                .foregroundStyle(.tint)
            Text("Steps")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("Connect Health")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private var notifContent: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "bell.badge.fill")
                .font(.title)
                .foregroundStyle(.orange)
            Text("Open UMA")
                .font(.subheadline.weight(.semibold))
        }
    }

    private var metricIcon: String {
        switch entry.configuration.metric {
        case .nextDose: return "pills.circle"
        case .latestBP: return "heart.fill"
        case .hbA1c: return "waveform.path.ecg"
        case .stepCount: return "figure.walk"
        case .notificationCount: return "bell.badge"
        }
    }

    private var accessibilityLabel: String {
        switch entry.configuration.metric {
        case .nextDose:
            if let dose = entry.nextDose {
                return "Next dose: \(dose.medicationName), \(dose.dose ?? "")"
            }
            return "No doses remaining today"
        case .latestBP:
            let sys = entry.store?.latestLab(named: "Systolic BP")?.value
            let dia = entry.store?.latestLab(named: "Diastolic BP")?.value
            if let s = sys, let d = dia {
                return "Blood pressure: \(Int(s)) over \(Int(d)) millimeters of mercury"
            }
            return "No blood pressure data"
        case .hbA1c:
            if let v = entry.store?.latestLab(named: "HbA1c")?.value {
                return "HbA1c: \(String(format: "%.1f", v)) percent"
            }
            return "No HbA1c data"
        case .stepCount:
            return "Step count widget"
        case .notificationCount:
            return "Notification count widget"
        }
    }
}
