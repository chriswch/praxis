export const EXIT_CODE = {
  OK: 0,
  INVALID_INPUT: 2,
  BLOCKED: 3,
  REJECTED: 4,
  FAILED: 5,
  HEALTH_FAILED: 6
} as const;

export type ExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE];
