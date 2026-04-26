/**
 * Structural validator for `clarify-assess` artifacts (product.md §5.2).
 * Implementation arrives via TDD in AC-11; the stub here keeps the schema
 * `function`-shape defined while tests drive the real behavior.
 */
export function validateClarifyAssessArtifact(
  _text: string,
): { ok: true } | { ok: false; reason: string } {
  return { ok: true };
}
