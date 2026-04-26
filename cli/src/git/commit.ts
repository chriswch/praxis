/**
 * Auto-commit hand-off (product.md §5.4).
 *
 * S-005 ships the call wiring (runner → `commit(cwd, message)` after the
 * auto-commit stage produces its message) but defers the actual `git add -A`
 * + `git commit -m` invocation to S-006. For now this is a no-op stub that
 * prints a single stderr notice so users running the happy path see the
 * commit was prepared but not executed. Returns `{ ok: true, skipped: true }`
 * — honest about not having performed the commit, while still classifying
 * the stage as completed.
 */
export function commit(
  _cwd: string,
  _message: string,
): { ok: true; skipped: true } {
  process.stderr.write(
    "praxis: auto-commit message ready; git commit not yet wired (lands in S-006)\n",
  );
  return { ok: true, skipped: true };
}
