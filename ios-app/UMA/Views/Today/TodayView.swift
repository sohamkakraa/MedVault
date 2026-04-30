// TodayView.swift — LazyVGrid bento layout with long-press reorder

import SwiftUI
import UMAShared

struct TodayView: View {
    @Environment(TodayViewModel.self) private var vm
    @State private var isEditingLayout = false
    @State private var draggedCard: String?

    private let adaptiveColumns = [
        GridItem(.adaptive(minimum: 168, maximum: 400), spacing: 12)
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: adaptiveColumns, spacing: 12) {
                    ForEach(orderedCards, id: \.self) { cardId in
                        cardView(for: cardId)
                            .onDrag {
                                draggedCard = cardId
                                UISelectionFeedbackGenerator().selectionChanged()
                                return NSItemProvider(object: cardId as NSString)
                            }
                            .onDrop(of: [.text], delegate: CardDropDelegate(
                                cardId: cardId,
                                draggedCard: $draggedCard,
                                cards: vm.cardOrder,
                                onMove: { from, to in
                                    vm.moveCard(from: from, to: to)
                                }
                            ))
                            .overlay(
                                isEditingLayout ? editingOverlay : nil,
                                alignment: .topTrailing
                            )
                            .transition(.scale.combined(with: .opacity))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
            .navigationTitle("Today")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(isEditingLayout ? "Done" : "Customise") {
                        withAnimation(.spring(response: 0.4)) {
                            isEditingLayout.toggle()
                        }
                        UISelectionFeedbackGenerator().selectionChanged()
                    }
                    .fontWeight(isEditingLayout ? .semibold : .regular)
                }
            }
            .refreshable {
                await vm.load()
            }
            .overlay {
                if vm.isLoading && vm.store.docs.isEmpty {
                    ProgressView("Loading your health data…")
                        .padding()
                        .glassCard()
                }
            }
        }
        .task {
            if vm.store.docs.isEmpty && vm.todayDoses.isEmpty {
                await vm.load()
            }
        }
    }

    private var orderedCards: [String] {
        // Ensure all known cards appear; add any missing to end
        var result = vm.cardOrder.filter { TodayCard(rawValue: $0) != nil }
        for card in TodayCard.defaultOrder where !result.contains(card) {
            result.append(card)
        }
        return result
    }

    @ViewBuilder
    private func cardView(for cardId: String) -> some View {
        switch TodayCard(rawValue: cardId) {
        case .nextDose:
            NextDoseCard(dose: vm.nextDose) {
                if let dose = vm.nextDose {
                    await vm.logDoseTaken(id: dose.id)
                }
            }
        case .latestBP:
            LatestBPCard(store: vm.store)
        case .hba1c:
            HbA1cCard(store: vm.store)
        case .recentLabs:
            RecentLabsCard(labs: vm.recentLabs)
        case .quickStats:
            QuickStatsCard(
                profile: vm.store.profile,
                activeMedCount: vm.store.activeMedications.count,
                docCount: vm.store.docs.count
            )
        case .none:
            EmptyView()
        }
    }

    private var editingOverlay: some View {
        Image(systemName: "line.3.horizontal")
            .font(.caption.weight(.bold))
            .foregroundStyle(.white)
            .padding(6)
            .background(.secondary, in: Circle())
            .padding(8)
    }
}

// MARK: - Drag and Drop Delegate

struct CardDropDelegate: DropDelegate {
    let cardId: String
    @Binding var draggedCard: String?
    var cards: [String]
    let onMove: (IndexSet, Int) -> Void

    func performDrop(info: DropInfo) -> Bool {
        draggedCard = nil
        return true
    }

    func dropEntered(info: DropInfo) {
        guard let dragged = draggedCard,
              dragged != cardId,
              let fromIdx = cards.firstIndex(of: dragged),
              let toIdx = cards.firstIndex(of: cardId) else { return }
        let destination = toIdx > fromIdx ? toIdx + 1 : toIdx
        withAnimation(.spring(response: 0.3)) {
            onMove(IndexSet(integer: fromIdx), destination)
        }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }
}
