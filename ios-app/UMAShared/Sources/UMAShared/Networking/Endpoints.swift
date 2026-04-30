// Endpoints.swift — typed API endpoint definitions

import Foundation

public enum UMAEndpoint: Sendable {
    case patientStore
    case extract
    case chat
    case stream

    private static let baseURL = URL(string: "https://uma.sohamkakra.com/api/")!

    public var url: URL {
        switch self {
        case .patientStore:
            return Self.baseURL.appendingPathComponent("patient-store")
        case .extract:
            return Self.baseURL.appendingPathComponent("extract")
        case .chat:
            return Self.baseURL.appendingPathComponent("chat")
        case .stream:
            return Self.baseURL.appendingPathComponent("stream")
        }
    }

    public var method: String {
        switch self {
        case .patientStore, .stream:
            return "GET"
        case .extract, .chat:
            return "POST"
        }
    }
}

// MARK: - Request/Response types

public struct ChatRequest: Codable, Sendable {
    public let message: String
    public let history: [ChatMessage]
    public let store: PatientStore?

    public init(message: String, history: [ChatMessage], store: PatientStore? = nil) {
        self.message = message
        self.history = history
        self.store = store
    }
}

public struct ExtractResponse: Codable, Sendable {
    public let doc: ExtractedDoc
    public let cost: ExtractionCost?
}

public struct ExtractionCost: Codable, Sendable {
    public let inputTokens: Int?
    public let outputTokens: Int?
    public let usd: Double?
    public let model: String?
    public let extractorSource: String?
}

public struct AuthRequest: Codable, Sendable {
    public let email: String
    public let channel: AuthChannel

    public enum AuthChannel: String, Codable, Sendable {
        case email
        case whatsapp
    }
}

public struct OTPVerifyRequest: Codable, Sendable {
    public let email: String
    public let otp: String
}

public struct AuthResponse: Codable, Sendable {
    public let token: String
    public let expiresAtISO: String
}
