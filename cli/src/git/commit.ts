/**
 * Stub for the auto-commit harness wrapper. Real implementation lands when
 * the auto-commit stage is wired (product.md §5.4).
 */
export function commit(_cwd: string, _message: string): never {
  throw new Error("commit: not implemented in S-001");
}
