// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "CAProgressSecureSession", platforms: [.iOS(.v15)], products: [.library(name: "CAProgressSecureSession", targets: ["SecureSessionPlugin"])], dependencies: [.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")], targets: [.target(name: "SecureSessionPlugin", dependencies: [.product(name: "Capacitor", package: "capacitor-swift-pm")], path: "ios/Sources/SecureSessionPlugin")])
