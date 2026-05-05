// DoseLiveActivityView.swift — Lock Screen + Dynamic Island views

import ActivityKit
import WidgetKit
import SwiftUI

struct DoseLiveActivityView: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DoseAttributes.self) { context in
            // Lock Screen / Banner view
            lockScreenView(context: context)
                .activityBackgroundTint(Color(.systemBackground))
                .activitySystemActionForegroundColor(Color.accentColor)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded regions
                DynamicIslandExpandedRegion(.leading) {
                    expandedLeading(context: context)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    expandedTrailing(context: context)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    expandedBottom(context: context)
                }
                DynamicIslandExpandedRegion(.center) {
                    expandedCenter(context: context)
                }
            } compactLeading: {
                compactLeading(context: context)
            } compactTrailing: {
                compactTrailing(context: context)
            } minimal: {
                minimal(context: context)
            }
            .keylineTint(Color.accentColor)
        }
    }

    // MARK: - Lock Screen

    @ViewBuilder
    private func lockScreenView(context: ActivityViewContext<DoseAttributes>) -> some View {
        HStack(spacing: 16) {
            // Progress ring
            ZStack {
                Circle()
                    .stroke(.secondary.opacity(0.2), lineWidth: 4)
                Circle()
                    .trim(from: 0, to: context.state.ringProgress)
                    .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut, value: context.state.ringProgress)

                Image(systemName: context.state.status.systemImage)
                    .font(.title3)
                    .foregroundStyle(context.state.status.isTaken ? .green : Color.accentColor)
            }
            .frame(width: 52, height: 52)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(context.attributes.medicationName)
                    .font(.headline)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    if let dose = context.attributes.dose {
                        Text(dose)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    if !context.state.status.isTaken {
                        Text("·").foregroundStyle(.secondary)
                        Text(context.state.timeRemainingLabel)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.accentColor)
                    } else {
                        Text("·").foregroundStyle(.secondary)
                        Text(context.state.status.label)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.green)
                    }
                }
            }

            Spacer()

            // Take button (AppIntent)
            if !context.state.status.isTaken {
                Button(intent: TakeDoseIntent(doseId: context.attributes.doseId)) {
                    Label("Take", systemImage: "checkmark")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.accentColor, in: Capsule())
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Mark \(context.attributes.medicationName) as taken")
            }
        }
        .padding(16)
        .accessibilityElement(children: .contain)
    }

    // MARK: - Dynamic Island Compact

    @ViewBuilder
    private func compactLeading(context: ActivityViewContext<DoseAttributes>) -> some View {
        Image(systemName: context.state.status.isTaken ? "checkmark.circle.fill" : "pills.circle.fill")
            .foregroundStyle(context.state.status.isTaken ? .green : Color.accentColor)
            .font(.body.weight(.semibold))
            .accessibilityLabel(context.state.status.isTaken ? "Dose taken" : "Dose due")
    }

    @ViewBuilder
    private func compactTrailing(context: ActivityViewContext<DoseAttributes>) -> some View {
        if context.state.status.isTaken {
            Text(context.state.status.label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.green)
        } else {
            Text(context.state.timeRemainingLabel)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Color.accentColor)
        }
    }

    // MARK: - Dynamic Island Minimal

    @ViewBuilder
    private func minimal(context: ActivityViewContext<DoseAttributes>) -> some View {
        ZStack {
            Circle()
                .stroke(.secondary.opacity(0.2), lineWidth: 2)
            if !context.state.status.isTaken {
                Circle()
                    .trim(from: 0, to: context.state.ringProgress)
                    .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            Image(systemName: context.state.status.isTaken ? "checkmark" : "pills")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(context.state.status.isTaken ? .green : Color.accentColor)
        }
        .accessibilityLabel(context.state.status.isTaken ? "Dose taken" : "Dose pending")
    }

    // MARK: - Dynamic Island Expanded

    @ViewBuilder
    private func expandedLeading(context: ActivityViewContext<DoseAttributes>) -> some View {
        ZStack {
            Circle()
                .stroke(.secondary.opacity(0.25), lineWidth: 3)
            if !context.state.status.isTaken {
                Circle()
                    .trim(from: 0, to: context.state.ringProgress)
                    .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            Image(systemName: context.state.status.systemImage)
                .font(.title3)
                .foregroundStyle(context.state.status.isTaken ? .green : Color.accentColor)
        }
        .frame(width: 44, height: 44)
        .padding(.leading, 4)
    }

    @ViewBuilder
    private func expandedTrailing(context: ActivityViewContext<DoseAttributes>) -> some View {
        if !context.state.status.isTaken {
            Button(intent: TakeDoseIntent(doseId: context.attributes.doseId)) {
                Label("Take", systemImage: "checkmark.circle.fill")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.accentColor, in: Capsule())
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .padding(.trailing, 4)
            .accessibilityLabel("Mark as taken")
        }
    }

    @ViewBuilder
    private func expandedCenter(context: ActivityViewContext<DoseAttributes>) -> some View {
        VStack(spacing: 2) {
            Text(context.attributes.medicationName)
                .font(.headline)
                .lineLimit(1)
            if let dose = context.attributes.dose {
                Text(dose)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func expandedBottom(context: ActivityViewContext<DoseAttributes>) -> some View {
        HStack {
            Image(systemName: "clock")
                .font(.caption)
                .foregroundStyle(.secondary)
            if context.state.status.isTaken {
                Text(context.state.status.label)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.green)
            } else {
                Text(context.state.timeRemainingLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
                Spacer()
                Button(intent: DismissDoseIntent(doseId: context.attributes.doseId)) {
                    Text("Dismiss")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(context.state.status.isTaken ? context.state.status.label : context.state.timeRemainingLabel)
    }
}
