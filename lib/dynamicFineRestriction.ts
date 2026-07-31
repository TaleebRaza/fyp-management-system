import FineRestrictionRule from '../models/FineRestrictionRule';
import StudentFine from '../models/StudentFine';
import User from '../models/User';
import type { EffectiveFineRestrictions } from '../types/fines';
import {
  resolveFineRestrictions,
  summarizeFineRestrictions,
  type RestrictionFine,
  type RestrictionRule,
} from './fineRestrictionEngine';

export { resolveFineRestrictions } from './fineRestrictionEngine';

export const DYNAMIC_FINE_RESTRICTION_CODE = 'DYNAMIC_FINE_RESTRICTION';

function serializeFine(fine: typeof StudentFine.prototype): RestrictionFine {
  return {
    id: String(fine._id),
    studentId: String(fine.studentId),
    fineTypeId: String(fine.fineTypeId),
    policyId: String(fine.policyId),
    projectId: fine.projectId ? String(fine.projectId) : null,
    policyRestrictions: fine.policyRestrictions || [],
    restrictionOverrideEnabled: fine.restrictionOverrideEnabled === true,
    restrictionOverride: fine.restrictionOverride || [],
  };
}

function serializeRule(rule: typeof FineRestrictionRule.prototype): RestrictionRule {
  return {
    id: String(rule._id),
    scope: rule.scope,
    label: rule.label,
    restrictions: rule.restrictions || [],
    fineTypeId: rule.fineTypeId ? String(rule.fineTypeId) : null,
    program: rule.program || null,
    batch: rule.batch || null,
    projectId: rule.projectId ? String(rule.projectId) : null,
    studentId: rule.studentId ? String(rule.studentId) : null,
    fineRecordId: rule.fineRecordId ? String(rule.fineRecordId) : null,
  };
}

async function ownEffectiveRestrictions(studentId: string) {
  const student = await User.findOne({ _id: studentId, role: 'student' })
    .select('_id program batch projectId name rollNo')
    .lean();
  if (!student) return null;
  const fines = await StudentFine.find({
    studentId: student._id,
    status: { $nin: ['scheduled', 'paid', 'waived', 'cancelled'] },
  }).select(
    '_id studentId fineTypeId policyId projectId policyRestrictions restrictionOverrideEnabled restrictionOverride'
  );
  if (fines.length === 0) {
    return {
      student,
      effective: summarizeFineRestrictions([]),
    };
  }

  const fineTypeIds = fines.map((fine) => fine.fineTypeId);
  const fineIds = fines.map((fine) => fine._id);
  const rules = await FineRestrictionRule.find({
    active: true,
    $or: [
      { scope: 'global' },
      { scope: 'fine-type', fineTypeId: { $in: fineTypeIds } },
      { scope: 'program-batch', program: { $in: [student.program, null] }, batch: { $in: [student.batch, null] } },
      { scope: 'project-team', projectId: student.projectId },
      { scope: 'student', studentId: student._id },
      { scope: 'fine-record', fineRecordId: { $in: fineIds } },
    ],
  });
  return {
    student,
    effective: resolveFineRestrictions(
      fines.map(serializeFine),
      rules.map(serializeRule),
      {
        studentId: String(student._id),
        program: student.program,
        batch: student.batch,
        projectId: student.projectId ? String(student.projectId) : null,
      }
    ),
  };
}

export async function getEffectiveFineRestrictions(studentId: string, includeTeam = true) {
  const own = await ownEffectiveRestrictions(studentId);
  if (!own || !includeTeam || !own.student.projectId) {
    return own?.effective || summarizeFineRestrictions([]);
  }

  const members = await User.find({
    role: 'student',
    projectId: own.student.projectId,
    _id: { $ne: own.student._id },
  })
    .select('_id name rollNo')
    .lean();
  const teamSources = [...own.effective.sources];
  let blockingTeamMember: EffectiveFineRestrictions['blockingTeamMember'] = null;
  for (const member of members) {
    const memberRestrictions = await ownEffectiveRestrictions(String(member._id));
    if (!memberRestrictions?.effective.blocksTeamPdfUpload) continue;
    teamSources.push(
      ...memberRestrictions.effective.sources.filter(
        (source) => source.restriction === 'pdf-upload-team'
      )
    );
    blockingTeamMember ||= {
      id: String(member._id),
      name: String(member.name || 'A team member'),
      rollNo: String(member.rollNo || ''),
    };
  }

  return {
    ...summarizeFineRestrictions(teamSources),
    blockingTeamMember,
  };
}

export async function getStudentFineLoginMode(studentId: string) {
  return (await getEffectiveFineRestrictions(studentId, false)).loginMode;
}

export type FineRestrictedAction =
  | 'normal-api'
  | 'pdf-upload'
  | 'supervisor-selection'
  | 'team-membership';

export async function getFineActionRestriction(studentId: string, action: FineRestrictedAction) {
  const effective = await getEffectiveFineRestrictions(studentId, action === 'pdf-upload');
  const blocked =
    (action === 'normal-api' && effective.loginMode !== 'none') ||
    (action === 'pdf-upload' && effective.blocksPdfUpload) ||
    (action === 'supervisor-selection' && effective.blocksSupervisorSelection) ||
    (action === 'team-membership' && effective.blocksTeamMembership);
  return blocked ? effective : null;
}

export function fineRestrictionMessage(
  restriction: EffectiveFineRestrictions,
  action: FineRestrictedAction
) {
  if (action === 'normal-api') {
    return restriction.loginMode === 'complete-lock'
      ? 'This account is locked by an unresolved fine. Contact the FYP administration.'
      : 'Portal access is limited to fine and payment status until the unresolved fine is cleared.';
  }
  if (action === 'pdf-upload' && restriction.blockingTeamMember) {
    const rollNo = restriction.blockingTeamMember.rollNo
      ? ` (${restriction.blockingTeamMember.rollNo})`
      : '';
    return `Project uploads are blocked by ${restriction.blockingTeamMember.name}${rollNo}'s unresolved fine.`;
  }
  if (action === 'pdf-upload') return 'Project uploads are blocked by an unresolved fine.';
  if (action === 'supervisor-selection') return 'Supervisor changes are blocked by an unresolved fine.';
  return 'Team changes are blocked by an unresolved fine.';
}
