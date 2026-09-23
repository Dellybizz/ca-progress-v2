// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "CAPLocalDatabase", platforms: [.iOS(.v15)], products: [.library(name: "CAPLocalDatabase", targets: ["LocalDatabasePlugin"])], dependencies: [.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", branch: "main")], targets: [.target(name: "LocalDatabasePlugin", dependencies: [.product(name: "Capacitor", package: "capacitor-swift-pm"), .product(name: "Cordova", package: "capacitor-swift-pm")], path: "ios/Sources/LocalDatabasePlugin")])
