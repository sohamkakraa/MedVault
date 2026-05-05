// LargeWidgetView.swift — systemLarge widget

import WidgetKit
import SwiftUI
import UMAShared

struct LargeWidgetView: View {
    let entry: UMAWidgetEntry

    private var recentLabs: [ExtractedLab] {
        Array(
            (entry.store?.labs ?? [])
                .sorted { $0.dateISO > $1.dateISO }
                .prefix(6)
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Header
            HStack {
                Label("UMA Health", systemImage: "heart.text.square.fill")
                    .font(.headline)
                    .foregroundStyle(.tint)
                Spacer()
                Text(entry.date, style: .date)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Divider()

            // Next dose section
            VStack(alignment: .leading, spacing: 8) {
                Text("Next Dose")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)

                if let dose = entry.nextDose {
                    HStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .stroke(.secondary.opacity(0.2), lineWidth: 3)
                            Circle()
                                .trim(from: 0, to: dose.ringProgress)
                                .stroke(.tint, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                        }
                        .frame(width: 40, height: 40)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(dose.medicationName)
                                .font(.subheadline.weight(.semibold))
                            HStack(spacing: 6) {
                                if let doseAmt = dose.dose { Text(doseAmt).font(.caption).foregroundStyle(.secondary) }
                                if let time = dose.scheduledTime {
                                    Text("·").foregroundStyle(.secondary)
                                    Text(time, style: .time).font(.caption).foregroundStyle(.tint)
                                }
                            }
                        }
                    }
                } else {
                    Label("All doses taken today", systemImage: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                        .font(.subheadline)
                }
            }

            Divider()

            // Lab results
            if !recentLabs.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Recent Labs")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)

                    ForEach(recentLabs) { lab in
                        HStack {
                            Text(lab.name)
                                .font(.caption)
                                .foregroundStyle(.primary)
                            Spacer()
                            HStack(spacing: 4) {
                                Text(String(format: lab.value >= 100 ? "%.0f" : "%.1f", lab.value))
                                    .font(.caption.weight(.semibold))
                                Text(lab.unit)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                if let flag = lab.flag, flag.isAbnormal {
                                    Image(systemName: flag == .high ? "arrow.up.circle.fill" : "arrow.down.circle.fill")
                                        .font(.caption2)
                                        .foregroundStyle(flag == .critical ? .red : .orange)
                                }
                            }
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("\(lab.name): \(String(format: "%.1f", lab.value)) \(lab.unit)\(lab.flag?.isAbnormal == true ? ", \(lab.flag!.label)" : "")")
                    }
                }
            }

            Spacer()

            // Footer
            HStack {
                Text(entry.store?.profile.name ?? "Your Health")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Spacer()
                Image(systemName: "heart.text.square.fill")
                    .font(.caption2)
                    .foregroundStyle(.tint)
            }
        }
        .padding(16)
        .widgetURL(URL(string: "uma://today"))
        .accessibilityElement(children: .contain)
    }
}
