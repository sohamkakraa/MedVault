// AccessoryCircularView.swift — accessoryCircular (Lock Screen / Watch) widget

import WidgetKit
import SwiftUI
import UMAShared

struct AccessoryCircularView: View {
    let entry: UMAWidgetEntry
    @Environment(\.widgetRenderingMode) private var renderingMode

    var body: some View {
        ZStack {
            // Background ring
            Circle()
                .stroke(.secondary.opacity(0.25), lineWidth: 3)

            switch entry.configuration.metric {
            case .nextDose:
                nextDoseCircular
            case .latestBP:
                bpCircular
            case .hbA1c:
                hba1cCircular
            case .stepCount:
                stepCircular
            case .notificationCount:
                notifCircular
            }
        }
        .widgetURL(URL(string: "uma://today"))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessLabel)
    }

    @ViewBuilder
    private var nextDoseCircular: some View {
        if let dose = entry.nextDose {
            Circle()
                .trim(from: 0, to: dose.ringProgress)
                .stroke(.tint, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))

            VStack(spacing: 1) {
                Image(systemName: "pills.circle.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.tint)
                if let time = dose.scheduledTime {
                    Text(time, format: .dateTime.hour().minute())
                        .font(.system(size: 9, weight: .medium))
                        .minimumScaleFactor(0.7)
                }
            }
        } else {
            Image(systemName: "checkmark.circle.fill")
                .font(.title2)
                .foregroundStyle(.green)
        }
    }

    @ViewBuilder
    private var bpCircular: some View {
        let sys = entry.store?.latestLab(named: "Systolic BP")?.value
        let dia = entry.store?.latestLab(named: "Diastolic BP")?.value
        if let s = sys, let d = dia {
            VStack(spacing: 0) {
                Image(systemName: "heart.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.red)
                Text("\(Int(s))/\(Int(d))")
                    .font(.system(size: 9, weight: .bold))
                    .minimumScaleFactor(0.5)
            }
        } else {
            Image(systemName: "heart.slash.fill")
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var hba1cCircular: some View {
        if let hba1c = entry.store?.latestLab(named: "HbA1c") {
            // Progress ring based on target (< 5.7 ideal, 7.0 = max for ring)
            let progress = min(hba1c.value / 7.0, 1.0)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(hba1cColor(hba1c.value), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))

            VStack(spacing: 0) {
                Text(String(format: "%.1f", hba1c.value))
                    .font(.system(size: 14, weight: .bold))
                Text("%")
                    .font(.system(size: 8))
                    .foregroundStyle(.secondary)
            }
        } else {
            Image(systemName: "waveform.path.ecg")
                .foregroundStyle(.secondary)
        }
    }

    private var stepCircular: some View {
        VStack(spacing: 0) {
            Image(systemName: "figure.walk")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.tint)
        }
    }

    private var notifCircular: some View {
        Image(systemName: "bell.badge.fill")
            .font(.title3)
            .foregroundStyle(.orange)
    }

    private func hba1cColor(_ value: Double) -> Color {
        switch value {
        case ..<5.7: return .green
        case 5.7..<6.5: return .orange
        default: return .red
        }
    }

    private var accessLabel: String {
        switch entry.configuration.metric {
        case .nextDose:
            return entry.nextDose.map { "Next: \($0.medicationName)" } ?? "All doses taken"
        case .latestBP:
            let s = entry.store?.latestLab(named: "Systolic BP")?.value
            let d = entry.store?.latestLab(named: "Diastolic BP")?.value
            return s.flatMap { sv in d.map { dv in "BP: \(Int(sv))/\(Int(dv))" } } ?? "No BP data"
        case .hbA1c:
            return entry.store?.latestLab(named: "HbA1c").map { "HbA1c: \(String(format: "%.1f", $0.value))%" } ?? "No HbA1c"
        case .stepCount:
            return "Step count"
        case .notificationCount:
            return "Notifications"
        }
    }
}
