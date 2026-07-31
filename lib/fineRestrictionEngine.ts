import type {
  EffectiveFineRestrictions,
  FineRestriction,
  FineRestrictionScope,
  FineRestrictionSource,
} from '../types/fines';
import { normalizeRestrictionSet } from './finePolicyEngine';

export type RestrictionFine = {
  id: string;
  studentId: string;
  fineTypeId: string;
  policyId: string;
  projectId?: string | null;
  policyRestrictions: FineRestriction[];
  restrictionOverrideEnabled?: boolean;
  restrictionOverride?: FineRestriction[];
};

export type RestrictionRule = {
  id: string;
  scope: FineRestrictionScope;
  label: string;
  restrictions: FineRestriction[];
  fineTypeId?: string | null;
  program?: string | null;
  batch?: string | null;
  projectId?: string | null;
  studentId?: string | null;
  fineRecordId?: string | null;
};

export type RestrictionContext = {
  studentId: string;
  program?: string | null;
  batch?: string | null;
  projectId?: string | null;
};

const SCOPE_PRECEDENCE: Record<FineRestrictionScope | 'policy', number> = {
  'fine-record': 60,
  student: 50,
  'project-team': 40,
  'program-batch': 30,
  'fine-type': 20,
  policy: 15,
  global: 10,
};

function ruleMatches(rule: RestrictionRule, fine: RestrictionFine, context: RestrictionContext) {
  if (rule.scope === 'global') return true;
  if (rule.scope === 'fine-record') return rule.fineRecordId === fine.id;
  if (rule.scope === 'student') return rule.studentId === context.studentId;
  if (rule.scope === 'project-team') return Boolean(context.projectId) && rule.projectId === context.projectId;
  if (rule.scope === 'program-batch') {
    return (
      (!rule.program || rule.program === context.program) &&
      (!rule.batch || rule.batch === context.batch)
    );
  }
  return rule.fineTypeId === fine.fineTypeId;
}

function sourceFor(
  fine: RestrictionFine,
  restriction: FineRestriction,
  scope: FineRestrictionScope | 'policy',
  sourceId: string,
  sourceLabel: string
): FineRestrictionSource {
  return {
    fineId: fine.id,
    fineTypeId: fine.fineTypeId,
    studentId: fine.studentId,
    restriction,
    scope,
    sourceId,
    sourceLabel,
  };
}

export function summarizeFineRestrictions(
  sources: FineRestrictionSource[]
): EffectiveFineRestrictions {
  const restrictions = [...new Set(sources.map((source) => source.restriction))];
  const loginMode = restrictions.includes('login-complete')
    ? 'complete-lock'
    : restrictions.includes('login-payment-only')
      ? 'payment-only'
      : 'none';
  return {
    restrictions,
    sources,
    loginMode,
    blocksPdfUpload:
      restrictions.includes('pdf-upload-student') || restrictions.includes('pdf-upload-team'),
    blocksTeamPdfUpload: restrictions.includes('pdf-upload-team'),
    blocksSupervisorSelection:
      restrictions.includes('supervisor-selection') ||
      restrictions.includes('supervisor-disband-project') ||
      restrictions.includes('supervisor-detach-student'),
    blocksTeamMembership: restrictions.includes('team-membership'),
    blockingTeamMember: null,
  };
}

export function resolveFineRestrictions(
  fines: RestrictionFine[],
  rules: RestrictionRule[],
  context: RestrictionContext
): EffectiveFineRestrictions {
  const sources: FineRestrictionSource[] = [];

  for (const fine of fines) {
    if (fine.restrictionOverrideEnabled) {
      for (const restriction of normalizeRestrictionSet(fine.restrictionOverride || ['none'])) {
        sources.push(sourceFor(fine, restriction, 'fine-record', fine.id, 'Fine Record override'));
      }
      continue;
    }

    const matchingRules = rules
      .filter((rule) => ruleMatches(rule, fine, context))
      .toSorted((left, right) => SCOPE_PRECEDENCE[right.scope] - SCOPE_PRECEDENCE[left.scope]);
    const highestPrecedence = matchingRules[0] ? SCOPE_PRECEDENCE[matchingRules[0].scope] : null;
    const winningRules = highestPrecedence == null
      ? []
      : matchingRules.filter((rule) => SCOPE_PRECEDENCE[rule.scope] === highestPrecedence);

    if (winningRules.length > 0) {
      for (const rule of winningRules) {
        for (const restriction of normalizeRestrictionSet(rule.restrictions)) {
          sources.push(sourceFor(fine, restriction, rule.scope, rule.id, rule.label));
        }
      }
      continue;
    }

    for (const restriction of normalizeRestrictionSet(fine.policyRestrictions || ['none'])) {
      sources.push(sourceFor(fine, restriction, 'policy', fine.policyId, 'Fine policy default'));
    }
  }

  return summarizeFineRestrictions(sources);
}
