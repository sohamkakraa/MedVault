// ChatView.swift — streaming AI chat with SSE

import SwiftUI
import UMAShared

struct ChatView: View {
    @Environment(ChatViewModel.self) private var vm
    @Environment(TodayViewModel.self) private var todayVm
    @FocusState private var inputFocused: Bool
    @State private var scrollProxy: ScrollViewProxy?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Message list
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            if vm.messages.isEmpty {
                                emptyState
                            } else {
                                ForEach(vm.messages) { msg in
                                    MessageBubble(message: msg)
                                        .id(msg.id)
                                        .padding(.horizontal, 8)
                                        .transition(.asymmetric(
                                            insertion: .move(edge: .bottom).combined(with: .opacity),
                                            removal: .opacity
                                        ))
                                }
                            }
                        }
                        .padding(.top, 12)
                        .padding(.bottom, 8)
                    }
                    .onChange(of: vm.messages.count) { _, _ in
                        if let last = vm.messages.last {
                            withAnimation {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                    .onChange(of: vm.messages.last?.content) { _, _ in
                        if let last = vm.messages.last {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }

                Divider()

                // Input bar
                inputBar
                    .safeAreaInset(edge: .bottom) {
                        Color.clear.frame(height: 0)
                    }
            }
            .navigationTitle("Chat with UMA")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button(role: .destructive) {
                            vm.clearHistory()
                        } label: {
                            Label("Clear Chat", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .onAppear {
                vm.updateStore(todayVm.store)
                vm.markRead()
            }
            .onChange(of: todayVm.store.updatedAtISO) { _, _ in
                vm.updateStore(todayVm.store)
            }
        }
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        @Bindable var vm = vm
        return HStack(alignment: .bottom, spacing: 8) {
            TextField("Ask about your health…", text: $vm.inputText, axis: .vertical)
                .lineLimit(1...5)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22))
                .focused($inputFocused)
                .submitLabel(.send)
                .onSubmit {
                    if vm.canSend {
                        Task { await vm.sendMessage() }
                    }
                }
                .accessibilityLabel("Message input")
                .accessibilityHint("Type your health question here")

            Group {
                if vm.isStreaming {
                    Button {
                        vm.cancelStream()
                    } label: {
                        Image(systemName: "stop.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.red)
                    }
                    .accessibilityLabel("Stop streaming response")
                } else {
                    Button {
                        Task { await vm.sendMessage() }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                            .foregroundStyle(vm.canSend ? .accentColor : .secondary)
                    }
                    .disabled(!vm.canSend)
                    .accessibilityLabel("Send message")
                    .accessibilityHint("Double tap to send your message to UMA")
                }
            }
            .frame(width: 44, height: 44)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.regularMaterial)
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "heart.text.square.fill")
                .font(.system(size: 60))
                .foregroundStyle(.accentColor)

            VStack(spacing: 8) {
                Text("Hi, I'm UMA")
                    .font(.title2.weight(.semibold))
                Text("Your personal health companion. Ask me about your medications, lab results, or anything health-related.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            // Suggestion chips
            VStack(spacing: 8) {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button {
                        vm.inputText = suggestion
                        inputFocused = true
                        UISelectionFeedbackGenerator().selectionChanged()
                    } label: {
                        Text(suggestion)
                            .font(.subheadline)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .frame(maxWidth: .infinity)
                            .background(.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                            .foregroundStyle(.primary)
                    }
                    .accessibilityLabel("Suggested question: \(suggestion)")
                }
            }
            .padding(.horizontal, 24)

            Text("Not medical advice. Always consult your doctor.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
        .accessibilityElement(children: .contain)
    }

    private let suggestions = [
        "What was my last HbA1c result?",
        "What medications am I currently on?",
        "When is my next doctor visit?",
        "Explain my latest lab report in simple terms"
    ]
}
