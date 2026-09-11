import SwiftUI
import RoomPlan
import PhotosUI
import ARKit

@main struct SurveyApp: App {
    @StateObject private var store = SurveyStore()
    var body: some Scene { WindowGroup { SurveyHome().environmentObject(store) } }
}
@MainActor final class SurveyStore: ObservableObject {
    @Published var document: [String: Any] = [:]
    @Published var message = ""
    let stages = ["Reference and units", "Room outlines and diagonals", "Openings and headroom", "Stairs and levels", "Fixtures and services", "Exterior, roof and site", "Review missing readings"]
    let file: URL
    init(file: URL = URL.documentsDirectory.appending(path: "survey-recovery.json")) {
        self.file = file
        if let data = try? Data(contentsOf: file), let saved = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { document = saved }
        else { document = ["format": "ModelForge.Survey", "version": 1, "units": "cm", "sourceId": UUID().uuidString, "geometry": ["nodes": [], "walls": [], "openings": [], "items": [], "surveyFeatures": []], "survey": ["enabled": true, "captures": [], "observations": [], "photos": [], "missions": []], "attachments": []] }
    }
    @discardableResult func persist() -> Bool {
        do { try JSONSerialization.data(withJSONObject: document, options: [.sortedKeys]).write(to: file, options: [.atomic]); return true }
        catch { message = error.localizedDescription; return false }
    }
    @discardableResult func reading(field: String, value: String, note: String, stage: Int) -> Bool {
        guard stages.indices.contains(stage) else { return false }
        let previous = document
        var survey = document["survey"] as? [String: Any] ?? [:]
        var entries = survey["observations"] as? [[String: Any]] ?? []
        var entry: [String: Any] = ["id": UUID().uuidString, "missionId": "native-\(stage)", "field": field, "unit": "cm", "reference": "interior", "source": "manual", "status": "entered", "note": note, "at": Date().timeIntervalSince1970 * 1000]
        if !value.isEmpty { guard let number = Double(value), number.isFinite else { message = "Enter a valid measurement in centimetres."; return false }; entry["value"] = number }
        guard entry["value"] != nil || !note.isEmpty else { message = "Record a reading or explain what is inaccessible."; return false }
        entries.append(entry); survey["observations"] = entries
        survey["missions"] = stages.enumerated().map { ["id": "native-\($0.offset)", "title": $0.element, "stage": ["setup","outline","openings","levels","fixtures","site","review"][$0.offset], "state": "pending"] }
        document["survey"] = survey
        guard persist() else { document = previous; return false }
        message = "Reading saved. Verify and locate it in the planner."; return true
    }
    func capture(_ room: CapturedRoom) {
        let previous = document
        do {
            let raw = try JSONSerialization.jsonObject(with: JSONEncoder().encode(room))
            var survey = document["survey"] as? [String: Any] ?? [:]
            var captures = survey["captures"] as? [[String: Any]] ?? []
            captures.append(["id": UUID().uuidString, "source": "Apple RoomPlan", "units": "m", "original": raw, "at": Date().timeIntervalSince1970 * 1000])
            survey["captures"] = captures; document["survey"] = survey
            document["capture"] = ["capturedRoom": raw, "units": "m"]
            guard persist() else { document = previous; return }
            message = "Room saved. Additional rooms retain separate evidence; align them in the planner."
        } catch { message = error.localizedDescription }
    }
    func photo(_ data: Data) {
        let previous = document
        guard let image = UIImage(data: data), let jpeg = image.jpegData(compressionQuality: 0.8) else { return }
        let id = UUID().uuidString
        var attachments = document["attachments"] as? [[String: Any]] ?? []
        attachments.append(["id": id, "data": "data:image/jpeg;base64," + jpeg.base64EncodedString(), "name": "Survey photo", "mimeType": "image/jpeg"])
        document["attachments"] = attachments
        var survey = document["survey"] as? [String: Any] ?? [:], photos = (document["survey"] as? [String: Any])?["photos"] as? [[String: Any]] ?? []
        photos.append(["id": id, "attachmentId": id, "name": "Survey photo", "mimeType": "image/jpeg"]); survey["photos"] = photos; document["survey"] = survey
        if !persist() { document = previous }
    }
    @discardableResult func undoLastReading() -> Bool {
        let previous = document
        var survey = document["survey"] as? [String: Any] ?? [:]
        var rows = survey["observations"] as? [[String: Any]] ?? []
        guard !rows.isEmpty else { return false }
        rows.removeLast(); survey["observations"] = rows; document["survey"] = survey
        guard persist() else { document = previous; return false }
        return true
    }
    func export() -> URL? {
        let url = file.deletingLastPathComponent().appending(path: "property.mfsurvey.json")
        do { try JSONSerialization.data(withJSONObject: document, options: [.prettyPrinted, .sortedKeys]).write(to: url, options: [.atomic]); return url }
        catch { message = error.localizedDescription; return nil }
    }
}
struct SurveyHome: View {
    @EnvironmentObject var store: SurveyStore
    @State private var stage = 0
    @State private var field = "length"
    @State private var location = ""
    @State private var value = ""
    @State private var note = ""
    @FocusState private var measurementFocused: Bool
    @State private var scanning = false
    @State private var photo: PhotosPickerItem?
    @State private var share: URL?
    var body: some View {
        NavigationStack { Form {
            Section("Current mission") { Picker("Mission", selection: $stage) { ForEach(0..<store.stages.count, id: \.self) { Text(LocalizedStringKey(store.stages[$0])).tag($0) } }
                Text(LocalizedStringKey(["Record floor, origin, north and height datum.", "Measure interior faces and diagonals. Retain irregular angles.", "Record clear widths, heights, swings, sill and head heights.", "Record total rise/run, representative treads, risers and thresholds.", "Record footprints, height and offsets from two reference walls.", "Record visible boundaries, roof points, elevations and site levels.", "Revisit missing, conflicting and inaccessible readings. Do not infer verification."][stage])) }
            Section("Manual measurement · interior face") {
                Picker("Measurement", selection: $field) {
                    Text("Length").tag("length"); Text("Width").tag("width"); Text("Depth").tag("depth")
                    Text("Height").tag("height"); Text("Thickness").tag("thickness")
                    Text("Diagonal").tag("diagonal"); Text("Sill height").tag("sill"); Text("Elevation").tag("elevation")
                }
                TextField("What and where", text: $location)
                TextField("Centimetres", text: $value).keyboardType(.decimalPad).accessibilityIdentifier("survey.value").focused($measurementFocused)
                TextField("Reference, bearing, diagonal or inaccessible detail", text: $note, axis: .vertical)
                Button("Save reading") { if store.reading(field: field, value: value, note: [location, note].filter { !$0.isEmpty }.joined(separator: "\n"), stage: stage) { value = ""; measurementFocused = false } }.accessibilityIdentifier("survey.saveReading")
            }
            Section("Capture") {
                if RoomCaptureSession.isSupported { Button("Scan another room") { scanning = true } }
                else { Text("Automatic room capture is unavailable. Manual measurements and photos remain available.") }
                PhotosPicker("Add photo", selection: $photo, matching: .images)
            }
            Section("Review and share") {
                Text(LocalizedStringKey(store.message)).accessibilityIdentifier("survey.message")
                Text("\(((store.document["survey"] as? [String: Any])?["observations"] as? [Any])?.count ?? 0) readings retained locally").accessibilityIdentifier("survey.count")
                Button("Undo last reading") { store.undoLastReading() }
                Button("Prepare portable survey") { share = store.export() }
                if let share { ShareLink(item: share) }
            }
        }.navigationTitle("As-Built Survey")
            .toolbar { ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { measurementFocused = false }.accessibilityIdentifier("survey.dismissKeyboard")
            } }
            .sheet(isPresented: $scanning) { CaptureScreen { room in store.capture(room); scanning = false } }
            .onChange(of: photo) { _, item in Task { if let data = try? await item?.loadTransferable(type: Data.self) { store.photo(data) } } }
        }
    }
}
struct CaptureScreen: View {
    var completed: (CapturedRoom) -> Void
    @StateObject private var controller = CaptureController()
    @Environment(\.dismiss) private var dismiss
    var body: some View { VStack { CaptureView(controller: controller).ignoresSafeArea(); Text(controller.error)
        HStack { Button("Cancel") { controller.cancel(); dismiss() }; Button("Review room") { controller.view.captureSession.stop() } }.padding()
    }.onAppear { controller.completed = completed }.onDisappear { controller.cancel() } }
}
@MainActor final class CaptureController: NSObject, ObservableObject, RoomCaptureViewDelegate {
    let view = RoomCaptureView(frame: .zero)
    @Published var error = ""
    var completed: ((CapturedRoom) -> Void)?
    override init() { super.init(); view.delegate = self }
    private var acceptsResult = true
    nonisolated required init?(coder: NSCoder) { return nil }
    nonisolated func encode(with coder: NSCoder) {}
    func cancel() { acceptsResult = false; view.captureSession.stop() }
    nonisolated func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        if let error { Task { @MainActor in self.error = error.localizedDescription }; return false }
        return true
    }
    nonisolated func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        Task { @MainActor in
            guard self.acceptsResult else { return }
            if let error { self.error = error.localizedDescription }
            else { self.acceptsResult = false; self.completed?(processedResult) }
        }
    }
}
struct CaptureView: UIViewRepresentable {
    let controller: CaptureController
    func makeUIView(context: Context) -> RoomCaptureView { DispatchQueue.main.async { controller.view.captureSession.run(configuration: RoomCaptureSession.Configuration()) }; return controller.view }
    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}
}
