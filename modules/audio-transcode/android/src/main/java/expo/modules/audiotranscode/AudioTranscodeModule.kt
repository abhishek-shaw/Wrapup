package expo.modules.audiotranscode

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.RandomAccessFile

private const val TIMEOUT_US = 10_000L
private const val BITS_PER_SAMPLE = 16
private const val DECODE_MAX_DURATION_MS = 120_000L

/**
 * Decodes a compressed audio file (AAC/.m4a in practice — whatever this
 * device's MediaCodec supports, which always includes AAC since it's a
 * mandatory codec on Android) into a 16-bit PCM WAV file at a target sample
 * rate.
 *
 * whisper.rn's file-based transcribe()/detectSpeech() do no real audio
 * decoding themselves — they just skip a 44-byte header and reinterpret
 * whatever bytes follow as raw 16-bit PCM. Recorded meetings are stored as
 * AAC for file-size reasons (see services/recording), so this module exists
 * to bridge the gap: decode once via the platform's own MediaCodec (no
 * network, no third-party binary to trust) to a temp WAV whisper.rn can
 * actually read.
 */
class AudioTranscodeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioTranscode")

    AsyncFunction("decodeToWavFile") { sourcePath: String, targetSampleRate: Int, outputPath: String ->
      decodeToWav(sourcePath, targetSampleRate, outputPath)
    }
  }

  private fun decodeToWav(sourcePath: String, targetSampleRate: Int, outputPath: String) {
    val cleanSourcePath = sourcePath.removePrefix("file://")
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(cleanSourcePath)
    } catch (e: Exception) {
      throw CodedException("ERR_TRANSCODE_SOURCE", "Failed to open source audio file: ${e.message}", e)
    }

    val (trackIndex, format) = findAudioTrack(extractor) ?: run {
      extractor.release()
      throw CodedException("ERR_TRANSCODE_NO_AUDIO_TRACK", "No audio track found in $cleanSourcePath", null)
    }
    extractor.selectTrack(trackIndex)

    val mime = format.getString(MediaFormat.KEY_MIME)
      ?: run {
        extractor.release()
        throw CodedException("ERR_TRANSCODE_NO_MIME", "Audio track has no MIME type", null)
      }
    val sourceSampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    val sourceChannelCount = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)

    val codec = try {
      MediaCodec.createDecoderByType(mime).apply {
        configure(format, null, null, 0)
        start()
      }
    } catch (e: Exception) {
      extractor.release()
      throw CodedException("ERR_TRANSCODE_NO_DECODER", "No decoder available for $mime: ${e.message}", e)
    }

    val cleanOutputPath = outputPath.removePrefix("file://")
    val outputFile = File(cleanOutputPath)
    val raf = RandomAccessFile(outputFile, "rw")

    try {
      raf.setLength(0)
      // Reserve WAV header space — we'll patch the size fields after decoding completes
      writeWavHeader(raf, 0, targetSampleRate)

      var totalPcmBytes = 0L
      drainDecoderStreaming(extractor, codec, sourceSampleRate, sourceChannelCount, targetSampleRate) { chunk ->
        raf.write(chunk)
        totalPcmBytes += chunk.size
      }

      // Patch the RIFF and data chunk size fields
      raf.seek(4)
      raf.write(intToLeBytes((36 + totalPcmBytes).toInt()))
      raf.seek(40)
      raf.write(intToLeBytes(totalPcmBytes.toInt()))
    } finally {
      raf.close()
      codec.stop()
      codec.release()
      extractor.release()
    }
  }

  /** Finds the first audio track and its format, or null if the file has none. */
  private fun findAudioTrack(extractor: MediaExtractor): Pair<Int, MediaFormat>? {
    for (i in 0 until extractor.trackCount) {
      val format = extractor.getTrackFormat(i)
      val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
      if (mime.startsWith("audio/")) {
        return i to format
      }
    }
    return null
  }

  /** Drains the decoder, processing and streaming each PCM chunk to the output callback. */
  private fun drainDecoderStreaming(
    extractor: MediaExtractor,
    codec: MediaCodec,
    sourceSampleRate: Int,
    sourceChannelCount: Int,
    targetSampleRate: Int,
    onChunk: (ByteArray) -> Unit
  ) {
    val bufferInfo = MediaCodec.BufferInfo()
    var sawInputEos = false
    var sawOutputEos = false
    val startTime = System.currentTimeMillis()

    while (!sawOutputEos) {
      val elapsed = System.currentTimeMillis() - startTime
      if (elapsed > DECODE_MAX_DURATION_MS) {
        throw CodedException(
          "ERR_TRANSCODE_DECODE",
          "Decoder exceeded maximum duration (${DECODE_MAX_DURATION_MS}ms)",
          null
        )
      }

      if (!sawInputEos) {
        val inputIndex = codec.dequeueInputBuffer(TIMEOUT_US)
        if (inputIndex >= 0) {
          val inputBuffer = codec.getInputBuffer(inputIndex)
            ?: throw CodedException("ERR_TRANSCODE_DECODE", "Decoder returned a null input buffer", null)
          val sampleSize = extractor.readSampleData(inputBuffer, 0)
          if (sampleSize < 0) {
            codec.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            sawInputEos = true
          } else {
            codec.queueInputBuffer(inputIndex, 0, sampleSize, extractor.sampleTime, 0)
            extractor.advance()
          }
        }
      }

      val outputIndex = codec.dequeueOutputBuffer(bufferInfo, TIMEOUT_US)
      if (outputIndex >= 0) {
        if (bufferInfo.size > 0) {
          val outputBuffer = codec.getOutputBuffer(outputIndex)
            ?: throw CodedException("ERR_TRANSCODE_DECODE", "Decoder returned a null output buffer", null)
          val pcmChunk = ByteArray(bufferInfo.size)
          outputBuffer.position(bufferInfo.offset)
          outputBuffer.limit(bufferInfo.offset + bufferInfo.size)
          outputBuffer.get(pcmChunk)

          val monoChunk = if (sourceChannelCount > 1) downmixToMono(pcmChunk, sourceChannelCount) else pcmChunk
          val outputChunk =
            if (sourceSampleRate != targetSampleRate) resampleMono16Bit(monoChunk, sourceSampleRate, targetSampleRate)
            else monoChunk

          onChunk(outputChunk)
        }
        codec.releaseOutputBuffer(outputIndex, false)
        if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
          sawOutputEos = true
        }
      }
    }
  }

  /** Averages interleaved N-channel 16-bit PCM down to mono. */
  private fun downmixToMono(pcm: ByteArray, channelCount: Int): ByteArray {
    val frameCount = pcm.size / (2 * channelCount)
    val mono = ByteArray(frameCount * 2)
    for (frame in 0 until frameCount) {
      var sum = 0
      for (channel in 0 until channelCount) {
        val sampleOffset = (frame * channelCount + channel) * 2
        val sample = (pcm[sampleOffset].toInt() and 0xFF) or (pcm[sampleOffset + 1].toInt() shl 8)
        sum += sample.toShort()
      }
      val averaged = (sum / channelCount).toShort()
      mono[frame * 2] = (averaged.toInt() and 0xFF).toByte()
      mono[frame * 2 + 1] = (averaged.toInt() shr 8).toByte()
    }
    return mono
  }

  /** Linear-interpolation resample of mono 16-bit PCM — adequate for ASR input, not audio-quality-critical. */
  private fun resampleMono16Bit(pcm: ByteArray, sourceRate: Int, targetRate: Int): ByteArray {
    val sourceFrameCount = pcm.size / 2
    if (sourceFrameCount == 0) return pcm

    val sourceSamples = ShortArray(sourceFrameCount)
    for (i in 0 until sourceFrameCount) {
      val sampleOffset = i * 2
      val sample = (pcm[sampleOffset].toInt() and 0xFF) or (pcm[sampleOffset + 1].toInt() shl 8)
      sourceSamples[i] = sample.toShort()
    }

    val targetFrameCount = ((sourceFrameCount.toLong() * targetRate) / sourceRate).toInt()
    val output = ByteArray(targetFrameCount * 2)
    val ratio = sourceRate.toDouble() / targetRate.toDouble()

    for (i in 0 until targetFrameCount) {
      val sourcePosition = i * ratio
      val sourceIndex = sourcePosition.toInt().coerceIn(0, sourceFrameCount - 1)
      val nextIndex = (sourceIndex + 1).coerceAtMost(sourceFrameCount - 1)
      val fraction = sourcePosition - sourceIndex

      val interpolated = sourceSamples[sourceIndex] + (sourceSamples[nextIndex] - sourceSamples[sourceIndex]) * fraction
      val sample = interpolated.toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())

      output[i * 2] = (sample and 0xFF).toByte()
      output[i * 2 + 1] = (sample shr 8).toByte()
    }
    return output
  }

  private fun writeWavHeader(raf: RandomAccessFile, dataSize: Int, sampleRate: Int) {
    val blockAlign = BITS_PER_SAMPLE / 8 // mono
    val byteRate = sampleRate * blockAlign

    raf.writeBytes("RIFF")
    raf.write(intToLeBytes(36 + dataSize))
    raf.writeBytes("WAVE")
    raf.writeBytes("fmt ")
    raf.write(intToLeBytes(16)) // PCM fmt chunk size
    raf.write(shortToLeBytes(1)) // AudioFormat = PCM
    raf.write(shortToLeBytes(1)) // NumChannels = mono
    raf.write(intToLeBytes(sampleRate))
    raf.write(intToLeBytes(byteRate))
    raf.write(shortToLeBytes(blockAlign.toShort()))
    raf.write(shortToLeBytes(BITS_PER_SAMPLE.toShort()))
    raf.writeBytes("data")
    raf.write(intToLeBytes(dataSize))
  }

  private fun intToLeBytes(value: Int): ByteArray =
    byteArrayOf(
      (value and 0xFF).toByte(),
      ((value shr 8) and 0xFF).toByte(),
      ((value shr 16) and 0xFF).toByte(),
      ((value shr 24) and 0xFF).toByte(),
    )

  private fun shortToLeBytes(value: Short): ByteArray {
    val v = value.toInt()
    return byteArrayOf((v and 0xFF).toByte(), ((v shr 8) and 0xFF).toByte())
  }
}
