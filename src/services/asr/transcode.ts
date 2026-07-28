/**
 * whisper.rn's file-based transcribe()/detectSpeech() do no real audio
 * decoding on either platform — they just skip a 44-byte header and
 * reinterpret whatever bytes follow as raw 16-bit PCM. Recorded meetings are
 * stored as AAC (.m4a) for file-size reasons (see services/recording), so
 * feeding that path straight to whisper.rn hands it a compressed bitstream
 * it silently misreads as noise, which is why VAD would report "no speech"
 * even on a good recording.
 *
 * This decodes the real audio via the local `audio-transcode` native module
 * (modules/audio-transcode — Android's own MediaExtractor/MediaCodec, no
 * network, no third-party binary to trust) and writes it out as a temporary
 * 16kHz mono PCM WAV file, the one format whisper.rn's naive reader actually
 * handles correctly.
 */
import AudioTranscode from "../../../modules/audio-transcode/src/AudioTranscodeModule";
import { File, Paths } from "expo-file-system";

// Matches whisper.rn/Silero VAD's expected input rate.
const TARGET_SAMPLE_RATE = 16000;

/**
 * Decodes a recorded meeting's audio (AAC/.m4a) into a temporary 16kHz mono
 * PCM WAV file whisper.rn can read directly. Caller owns the returned file
 * and must delete it via `deleteTempWavFile` once transcription is done.
 */
export async function decodeToTempWavFile(sourceUri: string): Promise<string> {
  const file = new File(Paths.cache, `asr-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
  await AudioTranscode.decodeToWavFile(sourceUri, TARGET_SAMPLE_RATE, file.uri);
  return file.uri;
}

/** Deletes a temp WAV file produced by decodeToTempWavFile. Safe to call even if already gone. */
export function deleteTempWavFile(uri: string): void {
  const file = new File(uri);
  if (file.exists) {
    file.delete();
  }
}
