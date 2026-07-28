import AVFoundation
import ExpoModulesCore

/**
 * Decodes a compressed audio file (AAC/.m4a in practice) into a 16-bit PCM
 * WAV file at a target sample rate — the iOS counterpart to the Android
 * implementation. See the Kotlin file for why this module exists:
 * whisper.rn's file-based transcribe()/detectSpeech() do no real audio
 * decoding, they just skip a 44-byte header and reinterpret whatever bytes
 * follow as raw 16-bit PCM.
 *
 * Uses AVAssetReader with linear PCM output settings, which does the
 * decode + resample + downmix to mono in one step via Core Audio — no
 * manual resampling needed (unlike the Android MediaCodec path, which
 * decodes at the source rate/channel count and resamples manually).
 */
public class AudioTranscodeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioTranscode")

    AsyncFunction("decodeToWavFile") { (sourcePath: String, targetSampleRate: Int, outputPath: String) in
      try await self.decodeToWav(sourcePath: sourcePath, targetSampleRate: targetSampleRate, outputPath: outputPath)
    }
  }

  private func decodeToWav(sourcePath: String, targetSampleRate: Int, outputPath: String) async throws {
    let sourceURL = URL(fileURLWithPath: stripFileScheme(sourcePath))
    let asset = AVURLAsset(url: sourceURL)

    let tracks = try await asset.loadTracks(withMediaType: .audio)
    guard let track = tracks.first else {
      throw NoAudioTrackException()
    }

    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: asset)
    } catch {
      throw ReaderInitException(underlying: error)
    }

    let outputSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: Double(targetSampleRate),
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    let trackOutput = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
    guard reader.canAdd(trackOutput) else {
      throw CannotAddOutputException()
    }
    reader.add(trackOutput)

    guard reader.startReading() else {
      throw StartReadingException(underlying: reader.error)
    }

    var pcmData = Data()
    while let sampleBuffer = trackOutput.copyNextSampleBuffer() {
      guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { continue }
      var length = 0
      var dataPointer: UnsafeMutablePointer<Int8>?
      let status = CMBlockBufferGetDataPointer(
        blockBuffer, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &dataPointer
      )
      if status == kCMBlockBufferNoErr, let dataPointer = dataPointer {
        pcmData.append(UnsafeBufferPointer(start: dataPointer, count: length))
      }
    }

    if reader.status == .failed {
      throw ReadingFailedException(underlying: reader.error)
    }

    try writeWavFile(pcmData: pcmData, sampleRate: targetSampleRate, outputPath: stripFileScheme(outputPath))
  }

  private func stripFileScheme(_ path: String) -> String {
    path.hasPrefix("file://") ? String(path.dropFirst(7)) : path
  }

  private func writeWavFile(pcmData: Data, sampleRate: Int, outputPath: String) throws {
    let bitsPerSample: UInt16 = 16
    let blockAlign: UInt16 = bitsPerSample / 8 // mono
    let byteRate = UInt32(sampleRate) * UInt32(blockAlign)

    var header = Data()
    header.append(contentsOf: "RIFF".utf8)
    header.append(leBytes(UInt32(36 + pcmData.count)))
    header.append(contentsOf: "WAVE".utf8)
    header.append(contentsOf: "fmt ".utf8)
    header.append(leBytes(UInt32(16))) // PCM fmt chunk size
    header.append(leBytes(UInt16(1))) // AudioFormat = PCM
    header.append(leBytes(UInt16(1))) // NumChannels = mono
    header.append(leBytes(UInt32(sampleRate)))
    header.append(leBytes(byteRate))
    header.append(leBytes(blockAlign))
    header.append(leBytes(bitsPerSample))
    header.append(contentsOf: "data".utf8)
    header.append(leBytes(UInt32(pcmData.count)))

    var fileData = header
    fileData.append(pcmData)
    try fileData.write(to: URL(fileURLWithPath: outputPath))
  }

  private func leBytes(_ value: UInt32) -> Data {
    var v = value.littleEndian
    return Data(bytes: &v, count: 4)
  }

  private func leBytes(_ value: UInt16) -> Data {
    var v = value.littleEndian
    return Data(bytes: &v, count: 2)
  }
}

internal class NoAudioTrackException: Exception {
  override var reason: String { "No audio track found in source file" }
}

internal class ReaderInitException: Exception {
  private let underlying: Error
  init(underlying: Error) {
    self.underlying = underlying
    super.init()
  }
  override var reason: String { "Failed to initialize asset reader: \(underlying.localizedDescription)" }
}

internal class CannotAddOutputException: Exception {
  override var reason: String { "Cannot add track output to asset reader" }
}

internal class StartReadingException: Exception {
  private let underlying: Error?
  init(underlying: Error?) {
    self.underlying = underlying
    super.init()
  }
  override var reason: String { "Failed to start reading: \(underlying?.localizedDescription ?? "unknown error")" }
}

internal class ReadingFailedException: Exception {
  private let underlying: Error?
  init(underlying: Error?) {
    self.underlying = underlying
    super.init()
  }
  override var reason: String { "Reading failed: \(underlying?.localizedDescription ?? "unknown error")" }
}
