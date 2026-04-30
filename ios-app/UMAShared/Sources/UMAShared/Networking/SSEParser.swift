// SSEParser.swift — parses URLSession.bytes → AsyncThrowingStream<ChatSSEEvent, Error>
// with exponential backoff: 1s, 2s, 5s, 10s, 30s ±25% jitter

import Foundation

public enum SSEError: Error, Sendable, LocalizedError {
    case invalidResponse(Int)
    case connectionLost
    case maxRetriesExceeded(Int)
    case decodingFailed(String)

    public var errorDescription: String? {
        switch self {
        case .invalidResponse(let code):
            return "Server returned status \(code)"
        case .connectionLost:
            return "Connection to server was lost"
        case .maxRetriesExceeded(let attempts):
            return "Failed after \(attempts) attempts"
        case .decodingFailed(let line):
            return "Could not decode SSE event: \(line)"
        }
    }
}

/// Parses a Server-Sent Events stream from URLSession.bytes.
public actor SSEParser {
    private let session: URLSession
    private let backoffDelays: [TimeInterval] = [1, 2, 5, 10, 30]

    public init(session: URLSession = .shared) {
        self.session = session
    }

    /// Returns an AsyncThrowingStream of decoded SSE events.
    /// Automatically retries on connection loss with jittered backoff.
    public func stream(
        request: URLRequest,
        maxRetries: Int = 5
    ) -> AsyncThrowingStream<ChatSSEEvent, Error> {
        AsyncThrowingStream { [weak self] continuation in
            guard let self else {
                continuation.finish()
                return
            }
            let task = Task {
                var attempt = 0
                while attempt <= maxRetries {
                    do {
                        try await self.openStream(request: request, continuation: continuation)
                        continuation.finish()
                        return
                    } catch is CancellationError {
                        continuation.finish()
                        return
                    } catch {
                        if attempt >= maxRetries {
                            continuation.finish(throwing: SSEError.maxRetriesExceeded(maxRetries))
                            return
                        }
                        let baseDelay = self.backoffDelays[min(attempt, self.backoffDelays.count - 1)]
                        let jitter = baseDelay * Double.random(in: -0.25...0.25)
                        let delay = max(0, baseDelay + jitter)
                        try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                        attempt += 1
                    }
                }
            }
            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    private func openStream(
        request: URLRequest,
        continuation: AsyncThrowingStream<ChatSSEEvent, Error>.Continuation
    ) async throws {
        let (bytes, response) = try await session.bytes(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw SSEError.connectionLost
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw SSEError.invalidResponse(httpResponse.statusCode)
        }

        var buffer = ""
        for try await byte in bytes {
            try Task.checkCancellation()
            let char = Character(UnicodeScalar(byte))
            buffer.append(char)
            // SSE uses double newline as event delimiter
            if buffer.hasSuffix("\n\n") || buffer.hasSuffix("\r\n\r\n") {
                let lines = buffer
                    .components(separatedBy: .newlines)
                    .filter { !$0.isEmpty }
                buffer = ""

                for line in lines {
                    if line.hasPrefix("data: ") {
                        let data = String(line.dropFirst(6))
                        if data == "[DONE]" {
                            return
                        }
                        if let event = try? decodeEvent(from: data) {
                            continuation.yield(event)
                            if event.done == true { return }
                        }
                    }
                }
            }
        }
    }

    private func decodeEvent(from jsonString: String) throws -> ChatSSEEvent {
        guard let data = jsonString.data(using: .utf8) else {
            throw SSEError.decodingFailed(jsonString)
        }
        let decoder = JSONDecoder()
        return try decoder.decode(ChatSSEEvent.self, from: data)
    }
}

// MARK: - Convenience plain-text token stream (for simple string-yielding SSE)

extension SSEParser {
    /// Extracts just the token strings from the event stream.
    public func tokenStream(
        request: URLRequest,
        maxRetries: Int = 5
    ) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            let eventStream = stream(request: request, maxRetries: maxRetries)
            let task = Task {
                do {
                    for try await event in eventStream {
                        if let token = event.token {
                            continuation.yield(token)
                        }
                        if event.done == true {
                            continuation.finish()
                            return
                        }
                        if let errMsg = event.error {
                            continuation.finish(throwing: SSEError.decodingFailed(errMsg))
                            return
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
}
