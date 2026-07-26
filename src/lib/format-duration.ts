export function formatDuration(totalSeconds: number): string {
  // Normalize invalid inputs: floor the value, and treat non-finite (NaN/Infinity)
  // or negative values as zero so labels never render "NaN" or negative durations.
  const normalized = !Number.isFinite(totalSeconds) || totalSeconds < 0 ? 0 : Math.floor(totalSeconds);
  const minutes = Math.floor(normalized / 60);
  const seconds = normalized % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
