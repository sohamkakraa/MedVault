// AuthToken.swift — Keychain-backed auth state tracking

import Foundation
import Security

public actor AuthToken {
    public static let shared = AuthToken()

    private let service = "com.sohamkakra.uma"
    private let tokenKey = "uma_session_token"

    public init() {}

    public var isAuthenticated: Bool {
        read(key: tokenKey) != nil
    }

    /// Returns the stored session token for Bearer auth, or nil if not authenticated.
    public var sessionToken: String? {
        read(key: tokenKey)
    }

    /// Stores the session token received from the server after OTP verification.
    public func storeToken(_ token: String) throws {
        try write(key: tokenKey, value: token)
    }

    public func clear() {
        delete(key: tokenKey)
    }

    // MARK: - Native Keychain helpers

    private func baseQuery(key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
    }

    private func read(key: String) -> String? {
        var query = baseQuery(key: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func write(key: String, value: String) throws {
        guard let data = value.data(using: .utf8) else { return }
        delete(key: key)
        var query = baseQuery(key: key)
        query[kSecValueData as String] = data
        let status = SecItemAdd(query as CFDictionary, nil)
        if status != errSecSuccess {
            throw KeychainError.unhandled(status: status)
        }
    }

    private func delete(key: String) {
        let query = baseQuery(key: key)
        SecItemDelete(query as CFDictionary)
    }

    enum KeychainError: Error {
        case unhandled(status: OSStatus)
    }
}
