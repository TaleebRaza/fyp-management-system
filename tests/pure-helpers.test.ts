import { describe, expect, it } from 'vitest';

import {
  formatProjectDomainLabels,
  getProjectDomainLabels,
  normalizeProjectDomainIds,
  validateProjectDomainIds,
} from '../config/projectDomains';
import { calculateLateRegistrationFine } from '../lib/lateRegistrationFine';
import { buildRollNoRegex, normalizeRollNo } from '../lib/rollNo';
import {
  isValidEmailAddress,
  isValidGmailAddress,
  normalizeEmailAddress,
  normalizeGmailAddress,
} from '../lib/studentIdentity';
import {
  getSupervisorMaxSlots,
  normalizeExtraSupervisorSlots,
} from '../lib/supervisorSlots';
import {
  DEFAULT_PROJECT_STAGE,
  MAX_TEAM_MEMBERS,
  PROGRAM_KEYS,
  PROJECT_STAGES,
} from '../config/appSettings';

describe('shared academic constants', () => {
  it('keeps the team limit, project stages, and program keys in one configuration', () => {
    expect(MAX_TEAM_MEMBERS).toBe(2);
    expect(PROJECT_STAGES).toEqual(['PROPOSAL', 'THESIS_DRAFT', 'FINAL_DELIVERABLES']);
    expect(DEFAULT_PROJECT_STAGE).toBe('PROPOSAL');
    expect(PROGRAM_KEYS).toEqual(['BSCS', 'BSAI', 'BSTN', 'BSSE', 'BSCYS', 'BSROB', 'BSDS']);
  });
});

describe('late-registration fine', () => {
  it('uses Pakistan calendar days at the configured deadline boundary', () => {
    expect(calculateLateRegistrationFine('2026-07-13T18:59:59Z')).toEqual({
      daysLate: 0,
      fineAmount: 0,
    });
    expect(calculateLateRegistrationFine('2026-07-13T19:00:00Z')).toEqual({
      daysLate: 1,
      fineAmount: 10,
    });
  });

  it('rejects an invalid effective date', () => {
    expect(() => calculateLateRegistrationFine('not-a-date')).toThrow(
      'A valid effective registration date is required.'
    );
  });
});

describe('student identity', () => {
  it('normalizes email addresses', () => {
    expect(normalizeEmailAddress('  Student@Example.COM ')).toBe('student@example.com');
    expect(normalizeEmailAddress(null)).toBe('');
    expect(normalizeGmailAddress(' Student.Name@GMAIL.com ')).toBe('student.name@gmail.com');
  });

  it('distinguishes general and Gmail addresses', () => {
    expect(isValidEmailAddress('student@example.com')).toBe(true);
    expect(isValidEmailAddress('student@example')).toBe(false);
    expect(isValidGmailAddress('student.name+fyp@gmail.com')).toBe(true);
    expect(isValidGmailAddress('student@example.com')).toBe(false);
  });
});

describe('roll numbers', () => {
  it('normalizes case and surrounding whitespace', () => {
    expect(normalizeRollNo('  bscs-2026-01 ')).toBe('BSCS-2026-01');
  });

  it('builds an exact, case-insensitive regex and escapes punctuation', () => {
    const regex = buildRollNoRegex('ab.c+1');

    expect(regex.test('  AB.C+1  ')).toBe(true);
    expect(regex.test('abxc+1')).toBe(false);
    expect(regex.test('prefix-ab.c+1')).toBe(false);
  });
});

describe('project domains', () => {
  it('validates arrays, removes duplicates, and reports invalid IDs', () => {
    expect(validateProjectDomainIds('machine-learning')).toEqual({
      isArray: false,
      ids: [],
      invalid: [],
    });
    expect(
      validateProjectDomainIds([
        'machine-learning',
        'machine-learning',
        'not-a-domain',
        '',
      ])
    ).toEqual({
      isArray: true,
      ids: ['machine-learning'],
      invalid: ['not-a-domain'],
    });
  });

  it('normalizes aliases and legacy domain text', () => {
    expect(normalizeProjectDomainIds(['AI', 'Web Development', 'AI'])).toEqual([
      'artificial-intelligence',
      'web-applications',
    ]);
    expect(normalizeProjectDomainIds([], 'ML + Cyber Security')).toEqual([
      'machine-learning',
      'cybersecurity',
    ]);
  });

  it('prefers canonical values and formats their labels', () => {
    const domainIds = normalizeProjectDomainIds(['computer-vision'], 'Machine Learning');

    expect(domainIds).toEqual(['computer-vision']);
    expect(getProjectDomainLabels(domainIds)).toEqual(['Computer Vision']);
    expect(formatProjectDomainLabels(domainIds, 'Machine Learning')).toBe('Computer Vision');
    expect(formatProjectDomainLabels([], 'Legacy Domain')).toBe('Legacy Domain');
  });
});

describe('supervisor slots', () => {
  it('clamps extra slots to the configured range', () => {
    expect(normalizeExtraSupervisorSlots(-1)).toBe(0);
    expect(normalizeExtraSupervisorSlots(3.9)).toBe(3);
    expect(normalizeExtraSupervisorSlots(999)).toBe(10);
    expect(normalizeExtraSupervisorSlots('invalid')).toBe(0);
  });

  it('adds normalized extra slots to the base capacity', () => {
    expect(getSupervisorMaxSlots({ extraSlots: 4 })).toBe(34);
    expect(getSupervisorMaxSlots({ extraSlots: 999 })).toBe(40);
  });
});
