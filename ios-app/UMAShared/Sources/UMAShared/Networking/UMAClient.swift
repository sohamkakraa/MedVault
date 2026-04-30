// UMAClient.swift — actor-based API client with retry/backoff

import Foundation

public enum UMAClientError: Error, Sendable, LocalizedError {
    case notAuthenticated
    case networkError(Error)
    case serverError(Int, String?)
    case decodingError(Error)
    case uploadFailed(String)

    public var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "You need to sign in to continue."
        case .networkError(let err):
            return "Network error: \(err.localizedDescription)"
        case .serverError(let code, let message):
            return message ?? "Server error \(code)"
        case .decodingError(let err):
            return "Could not read response: \(err.localizedDescription)"
        case .uploadFailed(let reason):
            return "Upload failed: \(reason)"
        }
    }
}

/// Main API client. All methods are isolated to the actor executor.
public actor UMAClient {
    public static let shared = UMAClient()

    private let session: URLSession
    private let sseParser: SSEParser
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let authToken: AuthToken

    private let backoffDelays: [TimeInterval] = [1, 2, 5, 10, 30]
    private let maxRetries = 3

    public init(
        session: URLSession = .shared,
        authToken: AuthToken = .shared
    ) {
        self.session = session
        self.sseParser = SSEParser(session: session)
        self.authToken = authToken

        decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
    }

    // MARK: - Patient Store

    /// Fetches the full PatientStore from the server.
    public func fetchStore() async throws -> PatientStore {
        let request = try await authenticatedRequest(for: .patientStore)
        return try await performRequest(request, decoding: PatientStore.self)
    }

    /// Streams PatientStore updates via SSE.
    public func streamStore() -> AsyncThrowingStream<PatientStore, Error> {
        AsyncThrowingStream { [weak self] continuation in
            guard let self else {
                continuation.finish()
                return
            }
            let task = Task {
                do {
                    var request = try await self.authenticatedRequest(for: .stream)
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    let eventStream = await self.sseParser.stream(request: request)
                    for try await event in eventStream {
                        if let token = event.token,
                           let data = token.data(using: .utf8),
                           let store = try? self.decoder.decode(PatientStore.self, from: data) {
                            continuation.yield(store)
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    // MARK: - PDF Upload

    /// Uploads a PDF and returns the extracted document.
    public func uploadPDF(data: Data, filename: String) async throws -> ExtractedDoc {
        var request = try await authenticatedRequest(for: .extract)
        request.httpMethod = "POST"

        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: application/pdf\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let response: ExtractResponse = try await performRequest(request, decoding: ExtractResponse.self)
        return response.doc
    }

    // MARK: - Chat (SSE streaming)

    /// Sends a chat message and returns an AsyncThrowingStream of token strings.
    public func sendChat(
        message: String,
        history: [ChatMessage],
        store: PatientStore?
    ) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { [weak self] continuation in
            guard let self else {
                continuation.finish()
                return
            }
            let task = Task {
                do {
                    var request = try await self.authenticatedRequest(for: .chat)
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

                    let chatReq = ChatRequest(message: message, history: history, store: store)
                    request.httpBody = try self.encoder.encode(chatReq)

                    let tokenStream = await self.sseParser.tokenStream(request: request)
                    for try await token in tokenStream {
                        continuation.yield(token)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    // MARK: - Auth

    public func requestOTP(email: String, channel: AuthRequest.AuthChannel) async throws {
        var request = URLRequest(url: UMAEndpoint.patientStore.url
            .deletingLastPathComponent()
            .appendingPathComponent("auth/login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = AuthRequest(email: email, channel: channel)
        request.httpBody = try encoder.encode(body)
        _ = try await performRawRequest(request)
    }

    public func verifyOTP(email: String, otp: String) async throws -> AuthResponse {
        var request = URLRequest(url: UMAEndpoint.patientStore.url
            .deletingLastPathComponent()
            .appendingPathComponent("auth/verify"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = OTPVerifyRequest(email: email, otp: otp)
        request.httpBody = try encoder.encode(body)
        return try await performRequest(request, decoding: AuthResponse.self)
    }

    // MARK: - Private helpers

    private func authenticatedRequest(for endpoint: UMAEndpoint) async throws -> URLRequest {
        guard let token = await authToken.token else {
            throw UMAClientError.notAuthenticated
        }
        var request = URLRequest(url: endpoint.url)
        request.httpMethod = endpoint.method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 30
        return request
    }

    private func performRequest<T: Decodable & Sendable>(
        _ request: URLRequest,
        decoding type: T.Type
    ) async throws -> T {
        let data = try await performWithRetry(request: request)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw UMAClientError.decodingError(error)
        }
    }

    private func performRawRequest(_ request: URLRequest) async throws -> Data {
        try await performWithRetry(request: request)
    }

    private func performWithRetry(request: URLRequest) async throws -> Data {
        var lastError: Error = UMAClientError.networkError(URLError(.unknown))
        for attempt in 0...maxRetries {
            do {
                let (data, response) = try await session.data(for: request)
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw UMAClientError.networkError(URLError(.badServerResponse))
                }
                guard (200...299).contains(httpResponse.statusCode) else {
                    let message = String(data: data, encoding: .utf8)
                    throw UMAClientError.serverError(httpResponse.statusCode, message)
                }
                return data
            } catch let error as UMAClientError {
                // Don't retry auth errors or 4xx
                if case .serverError(let code, _) = error, (400...499).contains(code) {
                    throw error
                }
                if case .notAuthenticated = error { throw error }
                lastError = error
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                lastError = UMAClientError.networkError(error)
            }

            if attempt < maxRetries {
                let baseDelay = backoffDelays[min(attempt, backoffDelays.count - 1)]
                let jitter = baseDelay * Double.random(in: -0.25...0.25)
                let delay = max(0.1, baseDelay + jitter)
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
        }
        throw lastError
    }
}
