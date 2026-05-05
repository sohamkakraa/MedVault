// ChatViewModel.swift — SSE-streaming chat with UMA assistant

import SwiftUI
import UMAShared

@Observable
@MainActor
final class ChatViewModel {
    var messages: [ChatMessage] = []
    var inputText = ""
    var isStreaming = false
    var errorMessage: String?
    var unreadCount = 0

    private let client = UMAClient.shared
    private var activeStreamTask: Task<Void, Never>?
    private var currentStore: PatientStore?

    func updateStore(_ store: PatientStore) {
        currentStore = store
    }

    func sendMessage() async {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isStreaming else { return }

        inputText = ""
        errorMessage = nil

        let userMsg = ChatMessage(role: .user, content: text)
        messages.append(userMsg)

        // Add streaming assistant placeholder
        var assistantMsg = ChatMessage(
            role: .assistant,
            content: "",
            isStreaming: true
        )
        messages.append(assistantMsg)
        isStreaming = true

        let assistantId = assistantMsg.id
        let history = Array(messages.dropLast(2)) // exclude user+empty assistant

        activeStreamTask = Task {
            let stream = await client.sendChat(
                message: text,
                history: history,
                store: currentStore
            )
            do {
                for try await token in stream {
                    if let idx = messages.firstIndex(where: { $0.id == assistantId }) {
                        messages[idx].content += token
                    }
                    try Task.checkCancellation()
                }
            } catch is CancellationError {
                // Streaming cancelled by user
            } catch {
                errorMessage = error.localizedDescription
                // Remove failed assistant message
                messages.removeAll { $0.id == assistantId }
            }

            // Mark streaming complete
            if let idx = messages.firstIndex(where: { $0.id == assistantId }) {
                messages[idx].isStreaming = false
            }
            isStreaming = false
        }

        await activeStreamTask?.value
    }

    func cancelStream() {
        activeStreamTask?.cancel()
        activeStreamTask = nil
        isStreaming = false
        // Remove incomplete assistant message
        messages.removeAll { $0.isStreaming }
    }

    func clearHistory() {
        messages = []
        unreadCount = 0
    }

    func markRead() {
        unreadCount = 0
    }

    var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isStreaming
    }
}
