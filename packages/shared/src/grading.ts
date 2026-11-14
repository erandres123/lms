export const TRANSMUTATION_POLICY = 'deped-do8-2015';

/**
 * DepEd Order No. 8, s. 2015 transmutation of the initial grade.
 * 60.00–100.00 maps to 75–100 in 1.60-point bands; below 60 maps to 60–74 in
 * 4-point bands, with 60 as the floor.
 */
export function transmuteInitialGrade(initial: number): number {
  const value = Math.round(initial * 100) / 100;

  if (!Number.isFinite(value)) return 60;
  if (value >= 100) return 100;
  if (value >= 60) return 75 + Math.floor((value - 60) / 1.6 + 1e-9);

  return Math.max(60, 60 + Math.floor(Math.max(value, 0) / 4));
}
