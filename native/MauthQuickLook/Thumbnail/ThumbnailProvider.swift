import QuickLookThumbnailing

final class ThumbnailProvider: QLThumbnailProvider {
  override func provideThumbnail(
    for request: QLFileThumbnailRequest, _ handler: @escaping (QLThumbnailReply?, Error?) -> Void
  ) {
    do {
      let summary = try MauthDocumentSummary.load(from: request.fileURL)
      let reply = QLThumbnailReply(
        contextSize: request.maximumSize,
        drawing: { context in
          summary.drawThumbnail(in: context, size: request.maximumSize)
          return true
        })
      reply.extensionBadge = "MAUTH"
      handler(reply, nil)
    } catch {
      handler(nil, error)
    }
  }
}
