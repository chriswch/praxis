import type { ConvergeProfile, GapAssessmentResult } from "../../contracts/model.js";
import { assessGaps } from "./assessment.js";

export interface GapAssessorInput {
  repoRoot: string;
  profile: ConvergeProfile;
  targetSpecPath: string;
  targetSpecText: string;
  scope: string[];
  reviewId: string;
  generatedAt: string;
}

export interface GapAssessorOutput {
  gap: GapAssessmentResult;
  gapMarkdown: string;
}

// Strategy interface for converge gap assessment. Pre-remediation code depends on this
// abstraction so a lexical/heuristic assessor can be swapped for a behavior- or
// test-backed one without touching the orchestration loop. See the architecture review
// (High #2) for context on why this seam exists.
export interface GapAssessor {
  assess(input: GapAssessorInput): Promise<GapAssessorOutput>;
}

// Default strategy: the repository-scanning, keyword/literal-matching assessor defined
// in `assessment.ts`. Treat it as a placeholder until a stronger signal is available.
export class LexicalGapAssessor implements GapAssessor {
  async assess(input: GapAssessorInput): Promise<GapAssessorOutput> {
    return assessGaps(input);
  }
}
