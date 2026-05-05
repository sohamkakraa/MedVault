// MediumWidgetView.swift — systemMedium widget

import WidgetKit
import SwiftUI
import UMAShared

struct MediumWidgetView: View {
    let entry: UMAWidgetEntry

    var body: some View {
        HStack(spacing: 0) {
            // Left: next dose
            VStack(alignment: .leading, spacing: 8) {
                Label("Next Dose", systemImage: "pills.circle")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                if let dose = entry.nextDose {
                    VStack(alignment: .leading, spacing: 4) {
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

                        // Progress ring
                        ZStack {
                            Circle()
                                .stroke(.secondary.opacity(0.2), lineWidth: 3)
                            Circle()
                                .trim(from: 0, to: dose.ringProgress)
                                .stroke(.tint, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                        }
                        .frame(width: 32, height: 32)
                        .padding(.top, 4)
                    }
                } else {
                    Label("All taken", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .font(.subheadline)
                }

                Spacer()
            }
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

            Divider()
                .padding(.vertical, 12)

            // Right: key stats
            VStack(alignment: .leading, spacing: 10) {
                Label("Key Stats", systemImage: "chart.bar")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                if let hba1c = entry.store?.latestLab(named: "HbA1c") {
                    statMiniRow(
                        label: "HbA1c",
                        value: String(format: "%.1f%%", hba1c.value),
                        flag: hba1c.flag
                    )
                }

                let sys = entry.store?.latestLab(named: "Systolic BP")
                let dia = entry.store?.latestLab(named: "Diastolic BP")
                if let s = sys, let d = dia {
                    statMiniRow(label: "BP", value: "\(Int(s.value))/\(Int(d.value))", flag: nil)
                }

                if let ldl = entry.store?.latestLab(named: "LDL") {
                    statMiniRow(
                        label: "LDL",
                        value: "\(Int(ldl.value)) mg/dL",
                        flag: ldl.flag
                    )
                }

                Spacer()
            }
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .widgetURL(URL(string: "uma://today"))
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func statMiniRow(label: String, value: String, flag: ExtractedLab.LabFlag?) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            HStack(spacing: 2) {
                Text(value)
                    .font(.caption.weight(.semibold))
                if let flag, flag.isAbnormal {
                    Image(systemName: flag == .high ? "arrow.up" : "arrow.down")
                        .font(.caption2)
                        .foregroundStyle(flag == .critical ? .red : .orange)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)\(flag?.isAbnormal == true ? ", \(flag!.label)" : "")")
    }
}
