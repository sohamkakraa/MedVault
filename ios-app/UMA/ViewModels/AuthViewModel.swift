// AuthViewModel.swift — OTP authentication flow

import SwiftUI
import UMAShared

@Observable
@MainActor
final class AuthViewModel {
    var isAuthenticated = false
    var isLoading = false
    var errorMessage: String?
    var otpSent = false
    var email = ""
    var devOtp: String?

    private let client = UMAClient.shared
    private let token = AuthToken.shared

    func checkAuthStatus() async {
        let keychainAuth = await token.isAuthenticated
        guard keychainAuth else {
            isAuthenticated = false
            return
        }
        do {
            let session = try await client.checkSession()
            isAuthenticated = session.ok
            if !session.ok {
                await token.clear()
            }
        } catch {
            isAuthenticated = false
        }
    }

    func requestOTP() async {
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else {
            errorMessage = "Please enter your email address."
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            devOtp = try await client.requestOTP(identifier: trimmed)
            otpSent = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func verifyOTP(_ otp: String) async {
        guard otp.count == 6 else {
            errorMessage = "Please enter the full 6-digit code."
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            try await client.verifyOTP(identifier: email.trimmingCharacters(in: .whitespaces), code: otp)
            isAuthenticated = true
            otpSent = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        await client.logout()
        isAuthenticated = false
        otpSent = false
        email = ""
    }
}
