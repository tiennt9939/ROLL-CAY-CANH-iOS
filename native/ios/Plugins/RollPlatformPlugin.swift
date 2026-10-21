import Foundation
import UIKit
import Capacitor
import UniformTypeIdentifiers
import PDFKit
import Vision
import AVFoundation
import WebKit

/// Native bridge for the iOS workspace. Business rules remain in the V26.2.92 web core.
/// All success payloads are returned only after the corresponding local operation completes.
@objc(RollPlatformPlugin)
public class RollPlatformPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate, WKNavigationDelegate {
    public let identifier = "RollPlatformPlugin"
    public let jsName = "RollPlatform"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAppVersionInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connectGoogleDrive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isDriveConnected", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "uploadDriveImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadDriveImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareDriveUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickTikTokShippingPdf", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanTikTokShippingBarcode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanDailyShipmentAssignedBatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ocrShippingImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportPdf", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "printA4Page", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "printOrder65x100", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listDailyShipmentPendingPhotos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadDailyShipmentPhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ackDailyShipmentPhoto", returnType: CAPPluginReturnPromise)
    ]

    private var pendingPDFCall: CAPPluginCall?
    private var pendingRenderWebView: WKWebView?
    private var pendingRenderCall: CAPPluginCall?
    private var pendingRenderName = ""
    private var pendingRenderAsPDF = false
    private let fileQueue = DispatchQueue(label: "vn.rollgardencanh.ios.files", qos: .utility)

    @objc func getAppVersionInfo(_ call: CAPPluginCall) {
        let info = Bundle.main.infoDictionary ?? [:]
        call.resolve([
            "versionName": info["CFBundleShortVersionString"] as? String ?? "26.2.92",
            "versionCode": Int(info["CFBundleVersion"] as? String ?? "144") ?? 144,
            "platform": "ios"
        ])
    }

    @objc func saveFile(_ call: CAPPluginCall) {
        let name = safeFileName(call.getString("fileName") ?? "ROLL-CAY-CANH.csv")
        let base64 = call.getString("base64") ?? ""
        let mime = call.getString("mimeType") ?? "application/octet-stream"
        guard !base64.isEmpty, base64.utf8.count <= 18_000_000,
              let data = Data(base64Encoded: base64), !data.isEmpty else {
            call.reject("Dữ liệu tệp không hợp lệ hoặc vượt giới hạn xuất tệp 12 MB.")
            return
        }
        let ext = (name as NSString).pathExtension
        let finalName = ext.isEmpty ? name + (mime.contains("csv") ? ".csv" : ".txt") : name
        presentShareSheet(data: data, fileName: finalName, call: call)
    }

    // Google Drive is intentionally fail-closed until the owner configures a real iOS OAuth client
    // and registers its URL scheme. Do not silently switch to Firebase Storage or a second data store.
    @objc func connectGoogleDrive(_ call: CAPPluginCall) {
        call.reject("Google Drive chưa được bật trên iOS: cần cấu hình OAuth client iOS, URL scheme và kiểm thử tài khoản trước khi kết nối.")
    }
    @objc func isDriveConnected(_ call: CAPPluginCall) { call.resolve(["connected": false]) }
    @objc func uploadDriveImage(_ call: CAPPluginCall) {
        call.reject("Tải ảnh lên Google Drive chưa khả dụng trên iOS cho đến khi hoàn tất OAuth. Ảnh chưa được tải lên.")
    }
    @objc func downloadDriveImage(_ call: CAPPluginCall) {
        call.reject("Đọc ảnh Google Drive chưa khả dụng trên iOS cho đến khi hoàn tất OAuth. Ảnh chưa được tải xuống.")
    }
    @objc func prepareDriveUpload(_ call: CAPPluginCall) {
        call.reject("Chuẩn bị tải ảnh lên Drive chưa khả dụng trên iOS cho đến khi cấu hình OAuth.")
    }

    @objc func pickTikTokShippingPdf(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pendingPDFCall == nil else {
                call.reject("Đang có một phiên chọn PDF khác. Hãy hoàn tất hoặc hủy phiên đó trước.")
                return
            }
            self.pendingPDFCall = call
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.pdf], asCopy: true)
            picker.delegate = self
            picker.allowsMultipleSelection = false
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pendingPDFCall else { return }
        pendingPDFCall = nil
        guard let url = urls.first else {
            call.resolve(["ok": false, "cancelled": true, "error": "Không có PDF được chọn."])
            return
        }
        let didAccess = url.startAccessingSecurityScopedResource()
        // PDFKit can inspect up to 200 pages / 1.5M characters. Do that off the main thread
        // so the warehouse app UI stays responsive; keep the file's security scope open until done.
        fileQueue.async {
            defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
            func finish(_ payload: [String: Any]) {
                DispatchQueue.main.async { call.resolve(payload) }
            }
            guard let document = PDFDocument(url: url) else {
                finish(["ok": false, "error": "Không mở được PDF đã chọn."])
                return
            }
            let count = document.pageCount
            guard count > 0 else {
                finish(["ok": false, "error": "PDF không có trang."])
                return
            }
            guard count <= 200 else {
                finish(["ok": false, "error": "PDF có \(count) trang. Vui lòng chia nhỏ file, tối đa 200 trang/lượt."])
                return
            }
            var pages: [[String: Any]] = []
            var totalChars = 0
            for index in 0..<count {
                guard let page = document.page(at: index) else { continue }
                let text = page.string ?? ""
                totalChars += text.count
                if totalChars > 1_500_000 {
                    finish(["ok": false, "error": "PDF có quá nhiều nội dung văn bản; vui lòng chia nhỏ file (giới hạn 1.500.000 ký tự/lượt)."])
                    return
                }
                // Reconstruct columns from PDFKit character bounds. If a layout has no stable table
                // header/coordinates, return no structured rows and retain the parser's text fallback.
                let visual = Self.extractVisualPDFTable(from: page)
                pages.append([
                    "page": index + 1,
                    "text": text,
                    "fallbackText": text,
                    "visualText": visual.visualText.isEmpty ? text : visual.visualText,
                    "tableRows": visual.tableRows
                ])
            }
            finish(["ok": true, "fileName": url.lastPathComponent, "pageCount": count, "pages": pages])
        }
    }

    // MARK: - Coordinate-aware TikTok PDF table reconstruction
    // PDFPage.characterBounds(at:) uses 72-dpi page coordinates with a lower-left origin.
    // We group glyphs by vertical location and sort them left-to-right before separating the
    // Product Name / SKU / Seller SKU / Qty columns at the actual header X coordinates.
    private struct PDFGlyph {
        let text: String
        let x: CGFloat
        let y: CGFloat
        let width: CGFloat
        let spaceWidth: CGFloat
    }
    private struct PDFVisualLine {
        var glyphs: [PDFGlyph] = []
        var ySum: CGFloat = 0
        var yCount: Int = 0
        var y: CGFloat { yCount == 0 ? 0 : ySum / CGFloat(yCount) }
        mutating func add(_ glyph: PDFGlyph) { glyphs.append(glyph); ySum += glyph.y; yCount += 1 }
        var ordered: [PDFGlyph] { glyphs.sorted { $0.x < $1.x } }
        var text: String {
            let sorted = ordered
            var output = ""
            var previousEnd: CGFloat? = nil
            var previousSpace: CGFloat = 3
            for glyph in sorted {
                if let end = previousEnd {
                    let gap = glyph.x - end
                    let width = max(1.5, max(previousSpace, glyph.spaceWidth))
                    if gap > width * 0.45 && !output.isEmpty && !output.hasSuffix(" ") { output += " " }
                }
                output += glyph.text
                previousEnd = max(previousEnd ?? glyph.x, glyph.x + glyph.width)
                previousSpace = glyph.spaceWidth
            }
            return output.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        // A compact version without geometric spaces lets us map ASCII header words back to glyph X.
        var compactGlyphText: String { ordered.map { $0.text }.joined().lowercased() }
        func xAtCompactCharacter(_ offset: Int) -> CGFloat? {
            var position = 0
            for glyph in ordered {
                let length = (glyph.text as NSString).length
                if offset < position + length { return glyph.x }
                position += length
            }
            return ordered.last?.x
        }
    }

    private static func extractVisualPDFTable(from page: PDFPage) -> (visualText: String, tableRows: [[String: Any]]) {
        guard let source = page.string, !source.isEmpty else { return ("", []) }
        let nsText = source as NSString
        let limit = min(page.numberOfCharacters, nsText.length)
        var glyphs: [PDFGlyph] = []
        glyphs.reserveCapacity(limit)
        var seen = Set<String>()
        if limit > 0 {
            for index in 0..<limit {
                let glyphText = nsText.substring(with: NSRange(location: index, length: 1))
                let bounds = page.characterBounds(at: index)
                // Whitespace often has a zero-height rect; omit it and reconstruct spaces from gaps.
                guard !glyphText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      !bounds.isNull, !bounds.isInfinite,
                      bounds.width > 0.01, bounds.height > 0.01 else { continue }
                let x = bounds.minX
                let y = bounds.midY
                let width = max(0, bounds.width)
                let spaceWidth = max(1.5, min(8, bounds.width * 0.52))
                let key = "\(Int((x * 2).rounded()))|\(Int((y * 2).rounded()))|\(glyphText)"
                if seen.insert(key).inserted {
                    glyphs.append(PDFGlyph(text: glyphText, x: x, y: y, width: width, spaceWidth: spaceWidth))
                }
            }
        }
        guard !glyphs.isEmpty else { return (source, []) }
        glyphs.sort { lhs, rhs in lhs.y == rhs.y ? lhs.x < rhs.x : lhs.y > rhs.y }
        var lines: [PDFVisualLine] = []
        for glyph in glyphs {
            if lines.isEmpty || abs(glyph.y - lines[lines.count - 1].y) > 2.8 { lines.append(PDFVisualLine()) }
            lines[lines.count - 1].add(glyph)
        }
        let visualText = lines.map { $0.text }.filter { !$0.isEmpty }.joined(separator: "\n")
        guard let headerIndex = lines.firstIndex(where: { line in
            let compact = line.compactGlyphText
            guard let product = compact.range(of: "productname"),
                  let sku = compact.range(of: "sku", range: product.upperBound..<compact.endIndex),
                  let seller = compact.range(of: "sellersku"),
                  let qty = compact.range(of: "qty", options: .backwards) else { return false }
            return product.lowerBound < sku.lowerBound && sku.lowerBound < seller.lowerBound && seller.lowerBound < qty.lowerBound
        }) else { return (visualText, []) }

        let header = lines[headerIndex]
        let compactHeader = header.compactGlyphText as NSString
        let productOffset = compactHeader.range(of: "productname").location
        guard productOffset != NSNotFound else { return (visualText, []) }
        let skuSearchStart = min(compactHeader.length, productOffset + 11)
        let skuOffset = compactHeader.range(of: "sku", options: [], range: NSRange(location: skuSearchStart, length: max(0, compactHeader.length - skuSearchStart))).location
        let sellerOffset = compactHeader.range(of: "sellersku").location
        let qtyOffset = compactHeader.range(of: "qty", options: .backwards).location
        guard skuOffset != NSNotFound, sellerOffset != NSNotFound, qtyOffset != NSNotFound,
              let productX = header.xAtCompactCharacter(productOffset),
              let skuX = header.xAtCompactCharacter(skuOffset),
              let sellerX = header.xAtCompactCharacter(sellerOffset),
              let qtyX = header.xAtCompactCharacter(qtyOffset),
              productX < skuX, skuX < sellerX, sellerX < qtyX else { return (visualText, []) }
        let boundaries = [skuX, sellerX, qtyX]
        var activeCells: [String]?
        var activeQty = 0
        var tableRows: [[String: Any]] = []
        func compact(_ value: String) -> String {
            value.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        func appendActiveRow() {
            guard let cells = activeCells, activeQty > 0 else { return }
            let name = compact(cells[0]), sku = compact(cells[1]), seller = compact(cells[2])
            guard !name.isEmpty || !sku.isEmpty || !seller.isEmpty else { return }
            tableRows.append(["productName": name, "sku": sku, "sellerSku": seller, "qty": activeQty])
        }
        if headerIndex + 1 < lines.count {
            for line in lines[(headerIndex + 1)...] {
                let lineText = line.text.trimmingCharacters(in: .whitespacesAndNewlines)
                if lineText.isEmpty { continue }
                let folded = lineText.lowercased()
                let foldedCompact = line.compactGlyphText.replacingOccurrences(of: "[^a-z0-9]", with: "", options: .regularExpression)
                if folded.contains("qty total:") || folded.contains("order id:") || foldedCompact.contains("qtytotal") || foldedCompact.contains("orderid") { break }
                var cells = ["", "", "", ""]
                var previousEnd = [CGFloat?](repeating: nil, count: 4)
                var previousSpace = [CGFloat](repeating: 3, count: 4)
                for glyph in line.ordered {
                    let column = glyph.x < boundaries[0] ? 0 : (glyph.x < boundaries[1] ? 1 : (glyph.x < boundaries[2] ? 2 : 3))
                    if let end = previousEnd[column] {
                        let gap = glyph.x - end
                        let width = max(1.5, max(previousSpace[column], glyph.spaceWidth))
                        if gap > width * 0.45 && !cells[column].isEmpty && !cells[column].hasSuffix(" ") { cells[column] += " " }
                    }
                    cells[column] += glyph.text
                    previousEnd[column] = max(previousEnd[column] ?? glyph.x, glyph.x + glyph.width)
                    previousSpace[column] = glyph.spaceWidth
                }
                let qtyText = compact(cells[3])
                if let qty = Int(qtyText), qty > 0, qty <= 1000,
                   qtyText.range(of: "^[0-9]{1,3}$", options: .regularExpression) != nil {
                    appendActiveRow()
                    activeCells = Array(cells.prefix(3))
                    activeQty = qty
                } else if activeCells != nil {
                    for column in 0..<3 {
                        let extra = compact(cells[column])
                        if !extra.isEmpty {
                            if !activeCells![column].isEmpty { activeCells![column] += " " }
                            activeCells![column] += extra
                        }
                    }
                }
            }
        }
        appendActiveRow()
        return (visualText, tableRows)
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard let call = pendingPDFCall else { return }
        pendingPDFCall = nil
        call.resolve(["ok": false, "cancelled": true, "error": "Đã hủy chọn PDF."])
    }

    @objc func ocrShippingImage(_ call: CAPPluginCall) {
        guard let raw = call.getString("dataUrl"), let comma = raw.firstIndex(of: ",") else {
            call.resolve(["ok": true, "text": ""])
            return
        }
        let base64 = String(raw[raw.index(after: comma)...])
        guard let bytes = Data(base64Encoded: base64), let image = UIImage(data: bytes), let cgImage = image.cgImage else {
            call.reject("Không giải mã được ảnh OCR. Hãy chụp lại nhãn rõ hơn.")
            return
        }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.minimumTextHeight = 0.008
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                // Vision language packs vary by the iOS version/device. Request Vietnamese
                // only when the runtime actually supports it, then retain English as fallback.
                
                var available: [String] = []
                if #available(iOS 15.0, *) {
                    available = (try? request.supportedRecognitionLanguages()) ?? []
                }
                let preferred = ["vi-VN", "en-US"].filter { available.contains($0) }
                if !preferred.isEmpty {
                    request.recognitionLanguages = preferred
                } else if let fallback = available.first {
                    request.recognitionLanguages = [fallback]
                }

                // If Vision reports no language list, leave its default instead of setting [].
                try handler.perform([request])
                let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
                call.resolve(["ok": true, "text": lines.joined(separator: "\n")])
            } catch {
                call.reject("OCR không đọc được nhãn: \(error.localizedDescription)")
            }
        }
    }

    @objc func exportPdf(_ call: CAPPluginCall) {
        let name = safeFileName(call.getString("jobName") ?? "ROLL-CAY-CANH") + ".pdf"
        capturePreparedPrintArea(jobName: name, asPDF: true, call: call)
    }

    @objc func printA4Page(_ call: CAPPluginCall) {
        capturePreparedPrintArea(jobName: call.getString("jobName") ?? "ROLL-CAY-CANH-BAO-GIA", asPDF: false, call: call)
    }

    @objc func printOrder65x100(_ call: CAPPluginCall) {
        // The captured HTML keeps the web core's @page orderLabel rule (65 x 100 mm).
        // The actual printer/paper profile must still be verified on a physical printer.
        capturePreparedPrintArea(jobName: call.getString("jobName") ?? "ROLL-CAY-CANH-LABEL-65X100", asPDF: false, call: call)
    }

    private func capturePreparedPrintArea(jobName: String, asPDF: Bool, call: CAPPluginCall) {
        guard pendingRenderCall == nil else { call.reject("Đang chuẩn bị một lệnh in/xuất PDF khác. Hãy đợi lệnh đó hoàn tất."); return }
        guard let sourceWebView = bridge?.webView else { call.reject("WebView chưa sẵn sàng để in hoặc xuất PDF."); return }
        let captureJS = """
        (function(){
          var ids=['orderPrintArea','quotePdfPrint'], el=null;
          for(var i=0;i<ids.length;i++){
            var x=document.getElementById(ids[i]);
            if(x&&x.innerHTML&&((x.getAttribute('aria-hidden')==='false')||x.classList.contains('show'))){el=x;break;}
          }
          if(!el)return '';
          function attrs(node){var s='';for(var i=0;i<node.attributes.length;i++){var a=node.attributes[i];s+=' '+a.name+'="'+String(a.value).replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"';}return s;}
          return '<!doctype html><html'+attrs(document.documentElement)+'><head>'+document.head.innerHTML+'</head><body'+attrs(document.body)+'>'+el.outerHTML+'</body></html>';
        })()
        """
        sourceWebView.evaluateJavaScript(captureJS) { result, error in
            if let error = error { call.reject("Không lấy được nội dung in đã chuẩn bị: \(error.localizedDescription)"); return }
            guard var html = result as? String, !html.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                call.reject("Không tìm thấy vùng báo giá/nhãn đã chuẩn bị để in.")
                return
            }
            // The capture is from this app's own DOM. Remove script nodes; the print renderer only needs markup and styles.
            if let regex = try? NSRegularExpression(pattern: "(?is)<script\\b[^>]*>.*?</script>") {
                html = regex.stringByReplacingMatches(in: html, range: NSRange(html.startIndex..., in: html), withTemplate: "")
            }
            DispatchQueue.main.async {
                let width: CGFloat = html.contains("print-order") ? 246 : 794
                let height: CGFloat = html.contains("print-order") ? 378 : 1123
                let renderer = WKWebView(frame: CGRect(x: 0, y: 0, width: width, height: height))
                renderer.navigationDelegate = self
                self.pendingRenderWebView = renderer
                self.pendingRenderCall = call
                self.pendingRenderName = self.safeFileName(jobName)
                self.pendingRenderAsPDF = asPDF
                renderer.loadHTMLString(html, baseURL: Bundle.main.resourceURL?.appendingPathComponent("public", isDirectory: true))
            }
        }
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView === pendingRenderWebView, let call = pendingRenderCall else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            guard webView === self.pendingRenderWebView, self.pendingRenderCall === call else { return }
            if self.pendingRenderAsPDF {
                if #available(iOS 14.0, *) {
                    webView.createPDF(configuration: WKPDFConfiguration()) { result in
                        switch result {
                        case .success(let data):
                            let fileName = self.pendingRenderName.hasSuffix(".pdf") ? self.pendingRenderName : self.pendingRenderName + ".pdf"
                            self.clearPendingRender()
                            self.presentShareSheet(data: data, fileName: fileName, call: call)
                        case .failure(let error):
                            self.clearPendingRender()
                            call.reject("Không tạo được PDF từ vùng báo giá/nhãn: \(error.localizedDescription)")
                        }
                    }
                } else {
                    self.clearPendingRender()
                    call.reject("Xuất PDF yêu cầu iOS 14 trở lên.")
                }
            } else {
                let controller = UIPrintInteractionController.shared
                let info = UIPrintInfo(dictionary: nil)
                info.jobName = self.pendingRenderName
                info.outputType = .general
                controller.printInfo = info
                controller.printFormatter = webView.viewPrintFormatter()
                controller.present(animated: true) { _, completed, error in
                    self.clearPendingRender()
                    if let error = error { call.reject("Không mở được chức năng in: \(error.localizedDescription)"); return }
                    call.resolve(["ok": true, "completed": completed, "jobName": info.jobName])
                }
            }
        }
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard webView === pendingRenderWebView, let call = pendingRenderCall else { return }
        clearPendingRender()
        call.reject("Không tải được bản in tạm: \(error.localizedDescription)")
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard webView === pendingRenderWebView, let call = pendingRenderCall else { return }
        clearPendingRender()
        call.reject("Không mở được bản in tạm: \(error.localizedDescription)")
    }

    private func clearPendingRender() {
        pendingRenderWebView?.stopLoading()
        pendingRenderWebView?.navigationDelegate = nil
        pendingRenderWebView = nil
        pendingRenderCall = nil
        pendingRenderName = ""
        pendingRenderAsPDF = false
    }

    private func presentShareSheet(data: Data, fileName: String, call: CAPPluginCall) {
        let tempFolder = FileManager.default.temporaryDirectory.appendingPathComponent("roll-share-\(UUID().uuidString)", isDirectory: true)
        let tempURL = tempFolder.appendingPathComponent(fileName)
        // File I/O may involve a large PDF/CSV: keep it off the main thread.
        fileQueue.async {
            do {
                try FileManager.default.createDirectory(at: tempFolder, withIntermediateDirectories: true)
                try data.write(to: tempURL, options: .atomic)
                DispatchQueue.main.async {
                    guard let presenter = self.bridge?.viewController else {
                        try? FileManager.default.removeItem(at: tempFolder)
                        call.reject("Không mở được bảng chia sẻ tệp.")
                        return
                    }
                    let sheet = UIActivityViewController(activityItems: [tempURL], applicationActivities: nil)
                    if let pop = sheet.popoverPresentationController {
                        pop.sourceView = presenter.view
                        pop.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
                    }
                    sheet.completionWithItemsHandler = { _, completed, _, error in
                        try? FileManager.default.removeItem(at: tempFolder)
                        if let error = error { call.reject("Không chia sẻ được tệp: \(error.localizedDescription)"); return }
                        call.resolve(["ok": true, "shared": completed, "fileName": fileName])
                    }
                    presenter.present(sheet, animated: true)
                }
            } catch {
                try? FileManager.default.removeItem(at: tempFolder)
                DispatchQueue.main.async { call.reject("Không tạo được tệp để chia sẻ: \(error.localizedDescription)") }
            }
        }
    }

    @objc func scanTikTokShippingBarcode(_ call: CAPPluginCall) {
        openScanner(expectedRows: [], dailyMode: false, call: call)
    }

    @objc func scanDailyShipmentAssignedBatch(_ call: CAPPluginCall) {
        let raw = call.getString("expectedOrdersJson") ?? "[]"
        guard raw.utf8.count <= 300_000,
              let data = raw.data(using: .utf8),
              let rows = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]],
              !rows.isEmpty, rows.count <= 500 else {
            call.reject("Danh sách mã được giao không hợp lệ hoặc vượt giới hạn 500 mã.")
            return
        }
        openScanner(expectedRows: rows, dailyMode: true, call: call)
    }

    private func openScanner(expectedRows: [[String: Any]], dailyMode: Bool, call: CAPPluginCall) {
        DispatchQueue.main.async {
            let scanner = RollBarcodeScannerViewController(expectedRows: expectedRows, dailyMode: dailyMode)
            var didStart = false
            scanner.onDailyCapture = { payload in self.evaluateJavaScriptCallback("__dailyShipmentCaptured", payload) }
            scanner.onFinished = { result in
                if dailyMode {
                    if didStart { self.evaluateJavaScriptCallback("__dailyShipmentBatchEnded", result) }
                    else { call.reject(String(describing: result["error"] ?? "Camera iOS không khởi động được.")) }
                } else {
                    call.resolve(result)
                }
            }
            scanner.onStarted = { if dailyMode { didStart = true; call.resolve(["ok": true, "started": true]) } }
            scanner.modalPresentationStyle = .fullScreen
            guard let presenter = self.bridge?.viewController else { call.reject("Không mở được camera iOS."); return }
            presenter.present(scanner, animated: true)
        }
    }

    @objc func listDailyShipmentPendingPhotos(_ call: CAPPluginCall) {
        fileQueue.async {
            let photos = self.queueDirectory()
            let urls = (try? FileManager.default.contentsOfDirectory(at: photos, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles])) ?? []
            let rows: [[String: Any]] = urls.compactMap { url in
                guard url.pathExtension.lowercased() == "jpg", url.lastPathComponent.hasPrefix("daily_shipment_"),
                      let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
                      let size = attrs[.size] as? NSNumber, size.intValue > 0, size.intValue <= 450 * 1024 else { return nil }
                let metaURL = url.deletingPathExtension().appendingPathExtension("meta.json")
                let meta = (try? Data(contentsOf: metaURL)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
                let track = String(url.deletingPathExtension().lastPathComponent.split(separator: "_").dropFirst(2).first ?? "")
                var row: [String: Any] = ["path": url.path, "trackingNo": meta["trackingNo"] as? String ?? track,
                    "employeeName": meta["employeeName"] as? String ?? "", "employeeId": meta["employeeId"] as? String ?? "",
                    "carrier": meta["carrier"] as? String ?? ""]
                for key in ["adminDelegated", "adminDelegateAssignedUid", "adminDelegateAssignmentRevision", "adminDelegateUid", "adminDelegateEmployeeName", "adminDelegateEmployeeId", "assignedUid", "assignmentRevision", "orderId"] {
                    if let value = meta[key] { row[key] = value }
                }
                return row
            }
            call.resolve(["photos": rows])
        }
    }

    @objc func loadDailyShipmentPhoto(_ call: CAPPluginCall) {
        let path = call.getString("path") ?? ""
        fileQueue.async {
            do {
                let fileURL = try self.validQueuePhoto(path: path)
                let data = try Data(contentsOf: fileURL)
                let metaURL = fileURL.deletingPathExtension().appendingPathExtension("meta.json")
                let meta = (try? Data(contentsOf: metaURL)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
                var payload: [String: Any] = ["ok": true, "nativePath": fileURL.path,
                    "trackingNo": meta["trackingNo"] as? String ?? "", "employeeName": meta["employeeName"] as? String ?? "",
                    "employeeId": meta["employeeId"] as? String ?? "", "carrier": meta["carrier"] as? String ?? "",
                    "photoDataUrl": "data:image/jpeg;base64,\(data.base64EncodedString())"]
                for key in ["adminDelegated", "adminDelegateAssignedUid", "adminDelegateAssignmentRevision", "adminDelegateUid", "adminDelegateEmployeeName", "adminDelegateEmployeeId", "assignedUid", "assignmentRevision", "orderId"] {
                    if let value = meta[key] { payload[key] = value }
                }
                call.resolve(payload)
            } catch { call.reject("Không tải được ảnh trong hàng đợi iOS: \(error.localizedDescription)") }
        }
    }

    @objc func ackDailyShipmentPhoto(_ call: CAPPluginCall) {
        let path = call.getString("path") ?? ""
        fileQueue.async {
            do {
                let file = try self.validQueuePhoto(path: path)
                try FileManager.default.removeItem(at: file)
                let meta = file.deletingPathExtension().appendingPathExtension("meta.json")
                if FileManager.default.fileExists(atPath: meta.path) { try FileManager.default.removeItem(at: meta) }
                call.resolve(["ok": true])
            } catch { call.reject("Không xóa được ảnh hàng đợi: \(error.localizedDescription)") }
        }
    }

    fileprivate func queueDirectory() -> URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = documents.appendingPathComponent("daily-shipment-queue", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    fileprivate func saveDailyPhoto(_ data: Data, trackingNo: String, expected: [String: Any]) throws -> String {
        let dir = queueDirectory()
        let safeTrack = trackingNo.uppercased().filter { $0.isLetter || $0.isNumber }
        let stamp = Int(Date().timeIntervalSince1970 * 1000)
        let file = dir.appendingPathComponent("daily_shipment_\(safeTrack)_\(stamp).jpg")
        try data.write(to: file, options: .atomic)
        let meta: [String: Any] = [
            "trackingNo": trackingNo,
            "employeeName": expected["assignedEmployeeName"] as? String ?? expected["employeeName"] as? String ?? "",
            "employeeId": expected["assignedEmployeeId"] as? String ?? expected["employeeId"] as? String ?? "",
            "carrier": expected["carrier"] as? String ?? "",
            "adminDelegated": expected["adminDelegated"] as? Bool ?? false,
            "adminDelegateAssignedUid": expected["adminDelegateAssignedUid"] as? String ?? "",
            "adminDelegateAssignmentRevision": expected["adminDelegateAssignmentRevision"] as? Int ?? expected["assignmentRevision"] as? Int ?? 0,
            "adminDelegateUid": expected["adminDelegateUid"] as? String ?? "",
            "adminDelegateEmployeeName": expected["adminDelegateEmployeeName"] as? String ?? expected["assignedEmployeeName"] as? String ?? "",
            "adminDelegateEmployeeId": expected["adminDelegateEmployeeId"] as? String ?? expected["assignedEmployeeId"] as? String ?? ""
        ]
        let metaURL = file.deletingPathExtension().appendingPathExtension("meta.json")
        try JSONSerialization.data(withJSONObject: meta, options: [.sortedKeys]).write(to: metaURL, options: .atomic)
        return file.path
    }

    fileprivate func validQueuePhoto(path: String) throws -> URL {
        let root = queueDirectory().standardizedFileURL
        let candidate = URL(fileURLWithPath: path).standardizedFileURL
        guard candidate.path.hasPrefix(root.path + "/"), candidate.lastPathComponent.hasPrefix("daily_shipment_"), candidate.pathExtension == "jpg" else {
            throw NSError(domain: "RollPlatform", code: 1, userInfo: [NSLocalizedDescriptionKey: "Đường dẫn ảnh không nằm trong hàng đợi an toàn."])
        }
        let attrs = try FileManager.default.attributesOfItem(atPath: candidate.path)
        let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
        guard size > 0, size <= 450 * 1024 else { throw NSError(domain: "RollPlatform", code: 2, userInfo: [NSLocalizedDescriptionKey: "Ảnh hàng đợi rỗng hoặc vượt 450 KB."]) }
        return candidate
    }

    private func evaluateJavaScriptCallback(_ name: String, _ payload: [String: Any]) {
        guard ["__dailyShipmentCaptured", "__dailyShipmentBatchEnded"].contains(name),
              JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload, options: [.fragmentsAllowed]),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { self.bridge?.webView?.evaluateJavaScript("if(window[\(String(reflecting: name))])window[\(String(reflecting: name))](\(json));", completionHandler: nil) }
    }


    fileprivate func safeFileName(_ value: String) -> String {
        let cleaned = value.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) || "-_ .".unicodeScalars.contains($0) }.map(String.init).joined()
        return String(cleaned.replacingOccurrences(of: " ", with: "-").prefix(100)).trimmingCharacters(in: CharacterSet(charactersIn: ".-"))
    }
}

private final class RollBarcodeScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate, AVCapturePhotoCaptureDelegate {
    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private let expectedRows: [[String: Any]]
    private let dailyMode: Bool
    private var expectedByTracking: [String: [String: Any]] = [:]
    private var seen = Set<String>()
    private var currentTracking = ""
    private var currentExpected: [String: Any] = [:]
    private var capturedCount = 0
    private var captureInProgress = false
    private var didFinish = false
    private let statusLabel = UILabel()
    private let stopButton = UIButton(type: .system)
    var onDailyCapture: (([String: Any]) -> Void)?
    var onFinished: (([String: Any]) -> Void)?
    var onStarted: (() -> Void)?

    init(expectedRows: [[String: Any]], dailyMode: Bool) {
        self.expectedRows = expectedRows
        self.dailyMode = dailyMode
        super.init(nibName: nil, bundle: nil)
        for row in expectedRows {
            let tracking = Self.normalize(String(describing: row["trackingNo"] ?? ""))
            if !tracking.isEmpty { expectedByTracking[tracking] = row }
        }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        statusLabel.text = dailyMode ? "Hướng camera vào mã đã được giao" : "Hướng camera vào mã vận đơn"
        statusLabel.textColor = .white; statusLabel.backgroundColor = UIColor.black.withAlphaComponent(0.65)
        statusLabel.textAlignment = .center; statusLabel.numberOfLines = 2; statusLabel.font = .boldSystemFont(ofSize: 16)
        view.addSubview(statusLabel)
        stopButton.setTitle("DỪNG QUÉT", for: .normal); stopButton.setTitleColor(.white, for: .normal)
        stopButton.backgroundColor = UIColor.systemRed; stopButton.layer.cornerRadius = 12
        stopButton.titleLabel?.font = .boldSystemFont(ofSize: 16)
        stopButton.addTarget(self, action: #selector(stopTapped), for: .touchUpInside)
        view.addSubview(stopButton)
        startCamera()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
        statusLabel.frame = CGRect(x: 16, y: view.safeAreaInsets.top + 14, width: view.bounds.width - 32, height: 66)
        stopButton.frame = CGRect(x: 24, y: view.bounds.height - view.safeAreaInsets.bottom - 76, width: view.bounds.width - 48, height: 52)
        view.bringSubviewToFront(statusLabel); view.bringSubviewToFront(stopButton)
    }

    private func startCamera() {
        let start: () -> Void = { [weak self] in
            guard let self = self else { return }
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    try self.configureCamera()
                    self.session.startRunning()
                    DispatchQueue.main.async { self.onStarted?(); self.statusLabel.text = self.dailyMode ? "Đang quét đúng mã được giao · Có thể dừng bất cứ lúc nào" : "Đang quét · Sau khi đọc mã sẽ chụp ảnh kiện hàng" }
                } catch {
                    DispatchQueue.main.async { self.finish(error: "Không mở được camera: \(error.localizedDescription)") }
                }
            }
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: start()
        case .notDetermined: AVCaptureDevice.requestAccess(for: .video) { granted in DispatchQueue.main.async { if granted { start() } else { self.finish(error: "Chưa được cấp quyền camera. Hãy bật Camera trong Cài đặt iPhone.") } } }
        default: finish(error: "Camera chưa được cấp quyền. Hãy bật Camera trong Cài đặt iPhone.")
        }
    }

    private func configureCamera() throws {
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .photo
        guard let device = AVCaptureDevice.default(for: .video) else { throw NSError(domain: "RollScanner", code: 1, userInfo: [NSLocalizedDescriptionKey: "Không tìm thấy camera."]) }
        let input = try AVCaptureDeviceInput(device: device)
        guard session.canAddInput(input) else { throw NSError(domain: "RollScanner", code: 2, userInfo: [NSLocalizedDescriptionKey: "Không thêm được camera."]) }
        session.addInput(input)
        let metadata = AVCaptureMetadataOutput()
        guard session.canAddOutput(metadata) else { throw NSError(domain: "RollScanner", code: 3, userInfo: [NSLocalizedDescriptionKey: "Không thêm được bộ đọc mã."]) }
        session.addOutput(metadata)
        metadata.setMetadataObjectsDelegate(self, queue: .main)
        let supported: [AVMetadataObject.ObjectType] = [.code128, .code39, .code93, .ean8, .ean13, .pdf417, .qr, .aztec, .dataMatrix, .itf14]
        metadata.metadataObjectTypes = supported.filter { metadata.availableMetadataObjectTypes.contains($0) }
        guard session.canAddOutput(photoOutput) else { throw NSError(domain: "RollScanner", code: 4, userInfo: [NSLocalizedDescriptionKey: "Không thêm được camera chụp ảnh."]) }
        session.addOutput(photoOutput)
        DispatchQueue.main.async {
            let layer = AVCaptureVideoPreviewLayer(session: self.session); layer.videoGravity = .resizeAspectFill
            self.view.layer.insertSublayer(layer, at: 0); self.previewLayer = layer; self.view.setNeedsLayout()
        }
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !captureInProgress, !didFinish else { return }
        guard let object = metadataObjects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject }).first,
              let value = object.stringValue, !value.isEmpty else { return }
        let tracking = Self.normalize(value)
        guard !tracking.isEmpty else { return }
        if dailyMode {
            guard let expected = expectedByTracking[tracking] else { statusLabel.text = "Mã ngoài danh sách phân công · đã bỏ qua"; return }
            let ready = expected["ready"] as? Bool ?? false
            let recorded = expected["recorded"] as? Bool ?? false
            let claimed = expected["claimed"] as? Bool ?? false
            guard ready && !recorded && !claimed else { statusLabel.text = "Mã chưa đủ điều kiện hoặc đã khóa · đã bỏ qua"; return }
            guard !seen.contains(tracking) else { statusLabel.text = "Mã đã quét trong phiên này · đã chặn trùng"; return }
            currentExpected = expected
        } else {
            currentExpected = [:]
        }
        if dailyMode && seen.contains(tracking) { return }
        currentTracking = tracking
        captureInProgress = true
        statusLabel.text = "Đã nhận mã \(tracking) · đang chụp ảnh…"
        let settings = AVCapturePhotoSettings()
        if let connection = photoOutput.connection(with: .video), connection.isVideoOrientationSupported { connection.videoOrientation = .portrait }
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        defer { captureInProgress = false }
        guard !didFinish else { return }
        guard error == nil, let raw = photo.fileDataRepresentation(), let image = UIImage(data: raw), let imageData = compressedJPEG(image) else {
            statusLabel.text = "Không chụp được ảnh. Hãy giữ camera ổn định và quét lại."
            return
        }
        let dataURL = "data:image/jpeg;base64,\(imageData.base64EncodedString())"
        if dailyMode {
            guard !seen.contains(currentTracking) else { statusLabel.text = "Mã đã quét · đã chặn trùng"; return }
            do {
                let path = try queueWrite(imageData, trackingNo: currentTracking, expected: currentExpected)
                seen.insert(currentTracking); capturedCount += 1
                var payload: [String: Any] = [
                    "ok": true, "trackingNo": currentTracking, "nativePath": path,
                    "photoDataUrl": dataURL,
                    "carrier": currentExpected["carrier"] as? String ?? "",
                    "employeeName": currentExpected["assignedEmployeeName"] as? String ?? "",
                    "employeeId": currentExpected["assignedEmployeeId"] as? String ?? ""
                ]
                for key in ["adminDelegated", "adminDelegateAssignedUid", "adminDelegateAssignmentRevision", "adminDelegateUid", "adminDelegateEmployeeName", "adminDelegateEmployeeId", "assignedUid", "assignmentRevision", "orderId"] {
                    if let v = currentExpected[key] { payload[key] = v }
                }
                onDailyCapture?(payload)
                statusLabel.text = "✅ Đã chụp \(capturedCount) ảnh · tiếp tục quét hoặc bấm DỪNG QUÉT"
            } catch {
                statusLabel.text = "Không lưu được ảnh: \(error.localizedDescription)"
            }
        } else {
            didFinish = true
            session.stopRunning()
            onFinished?(["ok": true, "value": currentTracking, "photoDataUrl": dataURL])
            DispatchQueue.main.async { self.dismiss(animated: true) }
        }
    }

    @objc private func stopTapped() { finish(error: nil) }
    private func finish(error: String?) {
        guard !didFinish else { return }
        didFinish = true
        DispatchQueue.global(qos: .utility).async { if self.session.isRunning { self.session.stopRunning() } }
        let result: [String: Any] = error == nil ? ["ok": true, "captured": capturedCount] : ["ok": false, "cancelled": true, "error": error!]
        onFinished?(result)
        DispatchQueue.main.async { self.dismiss(animated: true) }
    }

    private func queueWrite(_ data: Data, trackingNo: String, expected: [String: Any]) throws -> String {
        let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("daily-shipment-queue", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let normalized = trackingNo.filter { $0.isLetter || $0.isNumber }
        let file = root.appendingPathComponent("daily_shipment_\(normalized)_\(Int(Date().timeIntervalSince1970 * 1000)).jpg")
        try data.write(to: file, options: .atomic)
        var meta: [String: Any] = ["trackingNo": trackingNo,
            "employeeName": expected["assignedEmployeeName"] as? String ?? "",
            "employeeId": expected["assignedEmployeeId"] as? String ?? "",
            "carrier": expected["carrier"] as? String ?? ""]
        for key in ["adminDelegated", "adminDelegateAssignedUid", "adminDelegateAssignmentRevision", "adminDelegateUid", "adminDelegateEmployeeName", "adminDelegateEmployeeId", "assignedUid", "assignmentRevision", "orderId"] { if let v = expected[key] { meta[key] = v } }
        let metaURL = file.deletingPathExtension().appendingPathExtension("meta.json")
        try JSONSerialization.data(withJSONObject: meta, options: [.sortedKeys]).write(to: metaURL, options: .atomic)
        return file.path
    }

    private func compressedJPEG(_ image: UIImage) -> Data? {
        for side in [CGFloat(1100), CGFloat(900), CGFloat(720), CGFloat(560)] {
            let scale = min(1, side / max(image.size.width, image.size.height))
            let size = CGSize(width: max(1, image.size.width * scale), height: max(1, image.size.height * scale))
            let renderer = UIGraphicsImageRenderer(size: size)
            for quality in [CGFloat(0.65), CGFloat(0.48), CGFloat(0.32)] {
                let data = renderer.jpegData(withCompressionQuality: quality) { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
                if data.count <= 450 * 1024 { return data }
            }
        }
        return nil
    }

    private static func normalize(_ value: String) -> String {
        return value.uppercased().filter { $0.isLetter || $0.isNumber }
    }
}
