// AuthToken.swift — Keychain-backed OTP session token

import Foundation
import KeychainAccess

/// Thread-safe Keychain token storage.
/// Access policy: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
public actor AuthToken {
    public static let shared = AuthToken()

    private let keychain: Keychain
    private let tokenKey = "uma_session_token"
    private let expiryKey = "uma_session_expiry"

    public init() {
        keychain = Keychain(service: "com.sohamkakra.uma")
            .accessibility(.afterFirstUnlockThisDeviceOnly)
            .synchronizable(false) // device-only
    }

    /// Returns the stored token if it hasn't expired.
    public var token: String? {
        get {
            guard let tok = try? keychain.get(tokenKey) else { return nil }
            if isExpired { return nil }
            return tok
        }
    }

    /// True if the stored session has expired.
    public var isExpired: Bool {
        guard let expiryISO = try? keychain.get(expiryKey),
              let expiry = ISO8601DateFormatter().date(from: expiryISO) else {
            return true
        }
        return expiry <= Date()
    }

    /// True if there is a valid, unexpired token.
    public var isAuthenticated: Bool {
        token != nil
    }

    /// Saves a new token with its expiry to Keychain.
    public func save(token: String, expiresAtISO: String) throws {
        try keychain.set(token, key: tokenKey)
        try keychain.set(expiresAtISO, key: expiryKey)
    }

    /// Removes token and expiry from Keychain (sign out).
    public func clear() {
        try? keychain.remove(tokenKey)
        try? keychain.remove(expiryKey)
    }

    /// Returns the raw expiry ISO string for display.
    public var expiryISO: String? {
        try? keychain.get(expiryKey)
    }
}
