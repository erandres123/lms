import { transmuteInitialGrade } from '@lms/shared';
import { describe, expect, it } from 'vitest';

describe('transmuteInitialGrade (DO 8, s. 2015)', () => {
  it.each([
    [100, 100],
    [99.99, 99],
    [98.4, 99],
    [96.8, 98],
    [95.2, 97],
    [92, 95],
    [88.8, 93],
    [84, 90],
    [68, 80],
    [61.6, 76],
    [61.59, 75],
    [60, 75],
    [59.99, 74],
    [56, 74],
    [44, 71],
    [43.99, 70],
    [0, 60],
  ])('transmutes %s to %s', (initial, expected) => {
    expect(transmuteInitialGrade(initial)).toBe(expected);
  });

  it('floors below zero at 60', () => {
    expect(transmuteInitialGrade(-5)).toBe(60);
  });
});
