import Foundation
import Security
import Capacitor

@objc(SecureSessionPlugin)
public class SecureSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureSessionPlugin"
    public let jsName = "SecureSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]
    private let service = "in.zanisheluxe.caprogress.native-session"
    private func account(_ call: CAPPluginCall) -> String? {
        let key = call.getString("key") ?? "session"
        if key == "session" { return "active-bearer" }
        if key == "pkce" { return "pending-pkce" }
        return nil
    }

    private func baseQuery(_ account: String) -> [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account] }

    @objc func set(_ call: CAPPluginCall) {
        guard let account = account(call) else { call.reject("Secure storage key is invalid."); return }
        guard let value = call.getString("value"), !value.isEmpty, let data = value.data(using: .utf8) else { call.reject("Session token is required."); return }
        var query = baseQuery(account); SecItemDelete(query as CFDictionary)
        query[kSecValueData as String] = data; query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        status == errSecSuccess ? call.resolve() : call.reject("Keychain session storage failed (\(status)).")
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let account = account(call) else { call.reject("Secure storage key is invalid."); return }
        var query = baseQuery(account); query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?; let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { call.resolve(["value": NSNull()]); return }
        guard status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) else { call.reject("Keychain session could not be read (\(status))."); return }
        call.resolve(["value": value])
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let account = account(call) else { call.reject("Secure storage key is invalid."); return }
        SecItemDelete(baseQuery(account) as CFDictionary); call.resolve()
    }
}
