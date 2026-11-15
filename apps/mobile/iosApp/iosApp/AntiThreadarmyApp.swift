import SwiftUI
import Shared

struct SharedView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        MainViewControllerKt.MainViewController()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}

@main
struct AntiThreadarmyApp: App {
    var body: some Scene {
        WindowGroup {
            SharedView()
                .ignoresSafeArea()
                .preferredColorScheme(.dark)
        }
    }
}
