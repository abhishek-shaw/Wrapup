/**
 * Streaming SHA-256 for verifying downloaded model files.
 *
 * Model files are multi-GB — verifying them means hashing without ever
 * holding the whole file in memory. This used to be a hand-rolled pure-JS
 * implementation (there's no streaming digest in expo-crypto or
 * expo-file-system to reach for), but hashing a multi-hundred-MB file in
 * Hermes' bytecode interpreter took minutes and starved the JS thread badly
 * enough to freeze the download screen.
 *
 * `react-native-quick-crypto` runs the actual hashing natively (OpenSSL via
 * JSI), but `hasher.update()` still crosses the JS/native bridge on every
 * call — fed the small chunks `File.readableStream()` yields one at a time,
 * that per-call overhead dominates (measured ~88s for an 807MB file, vs
 * 323ms hashing the same bytes in one native call). Buffering stream chunks
 * into ~8MB batches before calling `update()` cuts the number of bridge
 * crossings by roughly two orders of magnitude.
 *
 * Even batched, hashing multi-GB files takes real time, and a chained
 * `await reader.read()` loop only ever yields a microtask turn — those
 * promises resolve near-instantly for a local file, so the microtask queue
 * never empties out and the JS thread never reaches a real macrotask
 * boundary. That starves React's re-renders and any timers for the whole
 * hash, which is what made the download screen look frozen even after
 * verification had actually started. Yielding to a real macrotask
 * (setTimeout, not another microtask) between batches keeps the UI
 * responsive and correctly showing "Verifying..." while hashing continues.
 */
import QuickCrypto from "react-native-quick-crypto";

const BATCH_BYTES = 8 * 1024 * 1024;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Hashes a stream of chunks (e.g. from `File.readableStream()`) without buffering the whole file. */
export async function sha256HexOfStream(
  stream: ReadableStream<Uint8Array>,
  onProgress?: (bytesRead: number) => void,
): Promise<string> {
  const hasher = QuickCrypto.createHash("sha256");
  const reader = stream.getReader();
  let bytesRead = 0;

  let batch: Uint8Array[] = [];
  let batchBytes = 0;

  const flushBatch = async () => {
    if (batch.length === 0) return;
    const combined = batch.length === 1 ? batch[0] : concatChunks(batch, batchBytes);
    hasher.update(combined);
    batch = [];
    batchBytes = 0;
    await yieldToEventLoop();
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    batch.push(value);
    batchBytes += value.length;
    bytesRead += value.length;
    onProgress?.(bytesRead);
    if (batchBytes >= BATCH_BYTES) {
      await flushBatch();
    }
  }
  await flushBatch();

  return hasher.digest("hex");
}

function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}
