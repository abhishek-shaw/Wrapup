/**
 * Native download progress callbacks can fire far more often than any UI
 * needs (potentially thousands of times for a multi-hundred-MB transfer,
 * especially over a fast/local connection) — forwarding every single one
 * into a React state update floods the JS thread with re-renders and can
 * leave it pegged busy for minutes after the transfer itself already
 * finished, which is what made the download screen look stuck at 100%.
 * This caps forwarded updates to once per `intervalMs`, always letting the
 * final (bytesWritten >= totalBytes) call through immediately.
 */
export function throttleDownloadProgress(
  onProgress: (bytesWritten: number, totalBytes: number) => void,
  intervalMs = 100,
): (bytesWritten: number, totalBytes: number) => void {
  let lastEmit = 0;
  return (bytesWritten: number, totalBytes: number) => {
    const now = Date.now();
    if (bytesWritten >= totalBytes || now - lastEmit >= intervalMs) {
      lastEmit = now;
      onProgress(bytesWritten, totalBytes);
    }
  };
}
