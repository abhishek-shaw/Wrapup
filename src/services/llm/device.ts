/**
 * Device-based model tier recommendation for onboarding — reads the
 * device's total RAM (a local, on-device hardware query; not user data,
 * no network involved) and suggests a starting tier. Guidance only: the
 * choose-model screen still lets the user pick any tier regardless of what
 * this recommends.
 */
import * as Device from "expo-device";

import type { ModelTier } from "@/types/models";

const GB = 1024 ** 3;

/**
 * RAM bands reflect what each tier's GGUF file realistically needs loaded
 * via mmap, with enough headroom left for the OS and the rest of the app:
 * - Best quality's 5.13GB file wants ~8GB+ total device RAM.
 * - Balanced's 2.49GB file is comfortable in the 4-8GB band most current
 *   mid-range phones ship with.
 * - Below 4GB, only Fast's 0.81GB file leaves enough headroom.
 */
export function recommendModelTier(totalMemoryBytes: number | null): ModelTier {
  if (totalMemoryBytes === null) return "fast";
  if (totalMemoryBytes < 4 * GB) return "fast";
  if (totalMemoryBytes < 8 * GB) return "balanced";
  return "best_quality";
}

/** Reads the current device's RAM and returns the recommended tier. Safe to
 * call on every mount of the choose-model screen — Device.totalMemory is a
 * synchronous local read, not an async permission-gated call. */
export function getRecommendedModelTier(): ModelTier {
  return recommendModelTier(Device.totalMemory);
}
