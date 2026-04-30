// ChatMessage.swift

import Foundation

public struct ChatMessage: Codable, Sendable, Identifiable, Equatable {
    public var id: String
    public var role: Role
    public var content: String
    public var timestampISO: String
    public var isStreaming: Bool

    public init(
        id: String = UUID().uuidString,
        role: Role,
        content: String,
        timestampISO: String = ISO8601DateFormatter().string(from: Date()),
        isStreaming: Bool = false
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.timestampISO = timestampISO
        self.isStreaming = isStreaming
    }

    public enum Role: String, Codable, Sendable, CaseIterable {
        case user
        case assistant
        case system
    }

    public var timestamp: Date {
        ISO8601DateFormatter().date(from: timestampISO) ?? Date()
    }

    public var isUser: Bool { role == .user }
    public var isAssistant: Bool { role == .assistant }
}

/// SSE event from /api/chat stream
public struct ChatSSEEvent: Codable, Sendable {
    public let type: EventType
    public let token: String?
    public let done: Bool?
    public let error: String?

    public enum EventType: String, Codable, Sendable {
        case token
        case done
        case error
    }
}
