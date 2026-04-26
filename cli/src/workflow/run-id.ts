/**
 * Format the canonical Praxis run-id from a UTC timestamp and 2 random bytes.
 *
 * Shape: `YYYY-MM-DD-HHMM-xxxx` where `xxxx` is the 4-character lowercase hex
 * encoding of `randomBytes`. Example: `2026-04-25-1430-7af2`.
 */
export function formatRunId(date: Date, randomBytes: Uint8Array): string {
  if (randomBytes.length < 2) {
    throw new Error(
      `formatRunId expects at least 2 random bytes, got ${randomBytes.length}`,
    );
  }
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  const hour = date.getUTCHours().toString().padStart(2, "0");
  const minute = date.getUTCMinutes().toString().padStart(2, "0");
  const hex = `${randomBytes[0].toString(16).padStart(2, "0")}${randomBytes[1]
    .toString(16)
    .padStart(2, "0")}`;
  return `${year}-${month}-${day}-${hour}${minute}-${hex}`;
}
