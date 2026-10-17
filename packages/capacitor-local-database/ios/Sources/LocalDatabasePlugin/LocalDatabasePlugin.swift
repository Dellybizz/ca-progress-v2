import Foundation
import SQLite3
import Capacitor

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

@objc(LocalDatabasePlugin)
public class LocalDatabasePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LocalDatabasePlugin"
    public let jsName = "LocalDatabase"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "execute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "transaction", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "query", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkpoint", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "wipe", returnType: CAPPluginReturnPromise)
    ]
    private var database: OpaquePointer?
    private var fileURL: URL { FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("ca-progress-local.db") }
    private var backupURL: URL { fileURL.appendingPathExtension("recovery") }
    private func close() { if database != nil { sqlite3_close(database); database = nil } }
    private func connect() throws {
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        if sqlite3_open_v2(fileURL.path, &database, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil) != SQLITE_OK { throw NSError(domain: "LocalDatabase", code: 1) }
        try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: fileURL.path)
        sqlite3_exec(database, "PRAGMA foreign_keys=ON", nil, nil, nil)
    }
    private func bind(_ values: [Any], to statement: OpaquePointer?) {
        for (offset, value) in values.enumerated() { let index = Int32(offset + 1)
            if value is NSNull { sqlite3_bind_null(statement, index) }
            else if let number = value as? NSNumber { CFGetTypeID(number) == CFBooleanGetTypeID() ? sqlite3_bind_int(statement,index,number.boolValue ? 1:0) : sqlite3_bind_double(statement,index,number.doubleValue) }
            else { sqlite3_bind_text(statement,index,String(describing:value),-1,SQLITE_TRANSIENT) }
        }
    }
    private func run(_ sql: String, _ values: [Any]) throws {
        var statement: OpaquePointer?; guard sqlite3_prepare_v2(database,sql,-1,&statement,nil) == SQLITE_OK else { throw NSError(domain:"LocalDatabase",code:2) }
        defer { sqlite3_finalize(statement) }; bind(values,to:statement); guard sqlite3_step(statement) == SQLITE_DONE else { throw NSError(domain:"LocalDatabase",code:3) }
    }
    @objc func open(_ call: CAPPluginCall) {
        var recovered=false
        do { try connect(); var statement:OpaquePointer?; if sqlite3_prepare_v2(database,"PRAGMA integrity_check",-1,&statement,nil) != SQLITE_OK || sqlite3_step(statement) != SQLITE_ROW || String(cString:sqlite3_column_text(statement,0)) != "ok" { sqlite3_finalize(statement); throw NSError(domain:"LocalDatabase",code:4) }; sqlite3_finalize(statement) }
        catch { do { close(); guard FileManager.default.fileExists(atPath:backupURL.path) else { throw error }; try? FileManager.default.removeItem(at:fileURL); try FileManager.default.copyItem(at:backupURL,to:fileURL); try connect(); recovered=true } catch { call.reject("Local database could not be recovered."); return } }
        call.resolve(["recovered":recovered])
    }
    @objc func execute(_ call: CAPPluginCall) { guard let sql=call.getString("sql") else {call.reject("SQL is required.");return}; do {try run(sql,call.getArray("args") ?? []);call.resolve()} catch {call.reject("Local database write failed.")} }
    @objc func transaction(_ call: CAPPluginCall) { let statements=call.getArray("statements",JSObject.self) ?? []; do {try run("BEGIN IMMEDIATE",[]);for item in statements {try run(item["sql"] as? String ?? "",item["args"] as? [Any] ?? [])};try run("COMMIT",[]);call.resolve()} catch {try? run("ROLLBACK",[]);call.reject("Local database transaction failed.")} }
    @objc func query(_ call: CAPPluginCall) {
        guard let sql=call.getString("sql") else {call.reject("SQL is required.");return};var statement:OpaquePointer?
        guard sqlite3_prepare_v2(database,sql,-1,&statement,nil)==SQLITE_OK else {call.reject("Local database query failed.");return};defer{sqlite3_finalize(statement)};bind(call.getArray("args") ?? [],to:statement);var rows:[[String:Any]]=[]
        while sqlite3_step(statement)==SQLITE_ROW {var row:[String:Any]=[:];for index in 0..<sqlite3_column_count(statement){let name=String(cString:sqlite3_column_name(statement,index));switch sqlite3_column_type(statement,index){case SQLITE_INTEGER:row[name]=sqlite3_column_int64(statement,index);case SQLITE_FLOAT:row[name]=sqlite3_column_double(statement,index);case SQLITE_TEXT:row[name]=String(cString:sqlite3_column_text(statement,index));case SQLITE_BLOB:let bytes=sqlite3_column_blob(statement,index);let count=Int(sqlite3_column_bytes(statement,index));row[name]=Data(bytes:bytes!,count:count).base64EncodedString();default:row[name]=NSNull()}};rows.append(row)};call.resolve(["rows":rows])
    }
    @objc func checkpoint(_ call:CAPPluginCall){do{close();try? FileManager.default.removeItem(at:backupURL);if FileManager.default.fileExists(atPath:fileURL.path){try FileManager.default.copyItem(at:fileURL,to:backupURL)};try connect();call.resolve()}catch{call.reject("Recovery checkpoint failed.")}}
    @objc func restore(_ call:CAPPluginCall){do{close();guard FileManager.default.fileExists(atPath:backupURL.path) else{throw NSError(domain:"LocalDatabase",code:5)};try? FileManager.default.removeItem(at:fileURL);try FileManager.default.copyItem(at:backupURL,to:fileURL);try connect();call.resolve()}catch{call.reject("Recovery restore failed.")}}
    @objc func wipe(_ call:CAPPluginCall){close();try? FileManager.default.removeItem(at:fileURL);try? FileManager.default.removeItem(at:backupURL);call.resolve()}
}
