import mongoose, { type ClientSession } from 'mongoose';

import VivaPanel from '../models/VivaPanel';
import VivaRound from '../models/VivaRound';
import User from '../models/User';
import { isVivaPanelAdmin } from './viva';
import { recordVivaAuditEvent, withVivaTransaction } from './vivaPersistence';

export type VivaPanelDto = {
  id: string;
  roundId: string;
  examinerIds: string[];
  panelAdminId: string;
};

export type VivaPanelDraft = Pick<VivaPanelDto, 'examinerIds' | 'panelAdminId'>;

export type VivaPanelSaveInput = {
  roundId: string;
  panelRevision: number;
  panels: VivaPanelDraft[];
};

export type VivaPanelAllocationInput = Pick<VivaPanelSaveInput, 'roundId' | 'panelRevision'>;

export type VivaPanelActor = {
  id: string;
  name: string;
  rollNo: string;
};

export type VivaPanelSaveResult =
  | { success: true; panels: VivaPanelDto[]; panelRevision: number }
  | {
      success: false;
      reason: 'invalid' | 'not-found' | 'frozen' | 'concurrent-change';
      error: string;
    };

export type VivaPanelAllocationResult =
  | { success: true; panels: VivaPanelDraft[]; panelRevision: number }
  | {
      success: false;
      reason: 'invalid' | 'not-found' | 'frozen' | 'concurrent-change';
      error: string;
    };

type VivaPanelRecord = {
  _id: unknown;
  roundId?: unknown;
  examinerIds?: unknown;
  panelAdminId?: unknown;
  chairId?: unknown;
};

type VivaRoundRecord = {
  _id: unknown;
  examinerIds?: unknown;
  targetPanelSize?: unknown;
  frozenAt?: Date | null;
  confirmedAt?: Date | null;
  panelRevision?: unknown;
};

type UserRecord = { _id: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asObjectId(value: unknown): string | null {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value) ? value : null;
}

function asObjectIdList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const ids = value.map(asObjectId);
  return ids.every((id): id is string => Boolean(id)) ? ids : null;
}

function asPanelRevision(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function panelRevision(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function serializeVivaPanel(panel: VivaPanelRecord): VivaPanelDto | null {
  const examinerIds = Array.isArray(panel.examinerIds) ? panel.examinerIds.map(String) : [];
  const panelAdminId = panel.panelAdminId ? String(panel.panelAdminId) : String(panel.chairId || '');

  if (!isVivaPanelAdmin(examinerIds, panelAdminId)) return null;

  return {
    id: String(panel._id),
    roundId: String(panel.roundId),
    examinerIds,
    panelAdminId,
  };
}

function parsePanel(value: unknown): VivaPanelDraft | null {
  if (!isRecord(value)) return null;

  const examinerIds = asObjectIdList(value.examinerIds);
  const panelAdminId = asObjectId(value.panelAdminId);
  if (!examinerIds || examinerIds.length === 0 || !panelAdminId) return null;
  if (new Set(examinerIds).size !== examinerIds.length) return null;
  if (!isVivaPanelAdmin(examinerIds, panelAdminId)) return null;

  return { examinerIds, panelAdminId };
}

export function parseVivaPanelSaveInput(value: unknown):
  | { success: true; input: VivaPanelSaveInput }
  | { success: false; error: string } {
  if (!isRecord(value)) {
    return { success: false, error: 'Invalid Viva panel details.' };
  }

  const roundId = asObjectId(value.roundId);
  const expectedPanelRevision = asPanelRevision(value.panelRevision);
  if (!roundId || expectedPanelRevision === null || !Array.isArray(value.panels)) {
    return { success: false, error: 'Invalid Viva panel details.' };
  }

  const panels = value.panels.map(parsePanel);
  if (panels.some((panel) => !panel)) {
    return { success: false, error: 'Each panel needs unique teachers and one panel admin from that panel.' };
  }

  const validPanels = panels.filter((panel): panel is NonNullable<typeof panel> => Boolean(panel));
  const assignedExaminerIds = validPanels.flatMap((panel) => panel.examinerIds);
  if (new Set(assignedExaminerIds).size !== assignedExaminerIds.length) {
    return { success: false, error: 'A teacher can be assigned to only one panel in this round.' };
  }

  return {
    success: true,
    input: { roundId, panelRevision: expectedPanelRevision, panels: validPanels },
  };
}

export function parseVivaPanelAllocationInput(value: unknown):
  | { success: true; input: VivaPanelAllocationInput }
  | { success: false; error: string } {
  if (!isRecord(value)) {
    return { success: false, error: 'Invalid Viva panel allocation request.' };
  }

  const roundId = asObjectId(value.roundId);
  const expectedPanelRevision = asPanelRevision(value.panelRevision);
  if (!roundId || expectedPanelRevision === null) {
    return { success: false, error: 'Invalid Viva panel allocation request.' };
  }

  return { success: true, input: { roundId, panelRevision: expectedPanelRevision } };
}

export function allocateRandomVivaPanels(
  examinerIds: readonly string[],
  targetPanelSize: number,
  random = Math.random
): VivaPanelDraft[] | null {
  if (
    !Number.isSafeInteger(targetPanelSize)
    || targetPanelSize < 2
    || examinerIds.length === 0
    || examinerIds.some((examinerId) => !examinerId.trim())
    || new Set(examinerIds).size !== examinerIds.length
  ) {
    return null;
  }

  const shuffledExaminerIds = [...examinerIds];
  for (let index = shuffledExaminerIds.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffledExaminerIds[index], shuffledExaminerIds[swapIndex]] = [
      shuffledExaminerIds[swapIndex],
      shuffledExaminerIds[index],
    ];
  }

  const panels: VivaPanelDraft[] = [];
  for (let start = 0; start < shuffledExaminerIds.length; start += targetPanelSize) {
    const panelExaminerIds = shuffledExaminerIds.slice(start, start + targetPanelSize);
    panels.push({
      examinerIds: panelExaminerIds,
      panelAdminId: panelExaminerIds[Math.floor(random() * panelExaminerIds.length)],
    });
  }

  return panels;
}

export async function getVivaPanels(): Promise<VivaPanelDto[]> {
  const panels = await VivaPanel.find()
    .select('_id roundId examinerIds panelAdminId chairId createdAt')
    .sort({ createdAt: 1, _id: 1 })
    .lean<VivaPanelRecord[]>();

  return panels.flatMap((panel) => {
    const serialized = serializeVivaPanel(panel);
    return serialized ? [serialized] : [];
  });
}

export async function validateVivaPanelsForRound(
  input: { examinerIds: string[]; targetPanelSize: number },
  roundId: string,
  session: ClientSession
): Promise<string | null> {
  const panels = await VivaPanel.find({ roundId })
    .select('examinerIds panelAdminId chairId')
    .session(session)
    .lean<VivaPanelRecord[]>();
  const allowedExaminerIds = new Set(input.examinerIds);

  for (const panel of panels) {
    const serialized = serializeVivaPanel(panel);
    if (!serialized || serialized.examinerIds.length > input.targetPanelSize) {
      return 'Update the existing panels before changing the target panel size.';
    }
    if (serialized.examinerIds.some((examinerId) => !allowedExaminerIds.has(examinerId))) {
      return 'Update the existing panels before changing the selected teachers.';
    }
  }

  return null;
}

async function validatePanelsForSave(
  input: VivaPanelSaveInput,
  round: VivaRoundRecord,
  session?: ClientSession
): Promise<string | null> {
  const targetPanelSize = Number(round.targetPanelSize);
  if (!Number.isSafeInteger(targetPanelSize) || targetPanelSize < 2) {
    return 'This Viva round has an invalid target panel size.';
  }

  const allowedExaminerIds = new Set(
    Array.isArray(round.examinerIds) ? round.examinerIds.map(String) : []
  );
  const assignedExaminerIds = input.panels.flatMap((panel) => panel.examinerIds);

  if (input.panels.some((panel) => panel.examinerIds.length > targetPanelSize)) {
    return `A panel cannot contain more than ${targetPanelSize} teachers.`;
  }
  if (assignedExaminerIds.some((examinerId) => !allowedExaminerIds.has(examinerId))) {
    return 'Panels can contain only teachers selected for this Viva round.';
  }

  let activeExaminers: UserRecord[] = [];
  if (assignedExaminerIds.length > 0) {
    const query = User.find({
      _id: { $in: assignedExaminerIds },
      role: 'supervisor',
      isActive: true,
    })
      .select('_id');
    if (session) query.session(session);
    activeExaminers = await query.lean<UserRecord[]>();
  }

  if (activeExaminers.length !== assignedExaminerIds.length) {
    return 'One or more panel teachers are no longer active supervisors.';
  }

  return null;
}

export async function previewRandomVivaPanels(
  input: VivaPanelAllocationInput
): Promise<VivaPanelAllocationResult> {
  const round = await VivaRound.findById(input.roundId)
    .select('_id examinerIds targetPanelSize frozenAt confirmedAt panelRevision')
    .lean<VivaRoundRecord | null>();
  if (!round) {
    return { success: false, reason: 'not-found', error: 'This Viva round no longer exists.' };
  }
  if (round.frozenAt || round.confirmedAt) {
    return {
      success: false,
      reason: 'frozen',
      error: 'This Viva round has started and its panels can no longer be changed.',
    };
  }
  if (panelRevision(round.panelRevision) !== input.panelRevision) {
    return {
      success: false,
      reason: 'concurrent-change',
      error: 'Another administrator changed these panels. Reload before generating a new draft.',
    };
  }

  const examinerIds = Array.isArray(round.examinerIds) ? round.examinerIds.map(String) : [];
  const panels = allocateRandomVivaPanels(examinerIds, Number(round.targetPanelSize));
  if (!panels) {
    return {
      success: false,
      reason: 'invalid',
      error: 'This Viva round needs unique selected teachers and a valid target panel size.',
    };
  }

  const validationError = await validatePanelsForSave(
    { roundId: input.roundId, panelRevision: input.panelRevision, panels },
    round
  );
  if (validationError) {
    return { success: false, reason: 'invalid', error: validationError };
  }

  return { success: true, panels, panelRevision: panelRevision(round.panelRevision) };
}

export async function saveVivaPanels(
  input: VivaPanelSaveInput,
  actor: VivaPanelActor
): Promise<VivaPanelSaveResult> {
  return withVivaTransaction(async (session) => {
    const round = await VivaRound.findById(input.roundId)
      .select('_id examinerIds targetPanelSize frozenAt confirmedAt panelRevision')
      .session(session)
      .lean<VivaRoundRecord | null>();
    if (!round) {
      return { success: false, reason: 'not-found', error: 'This Viva round no longer exists.' };
    }
    if (round.frozenAt || round.confirmedAt) {
      return {
        success: false,
        reason: 'frozen',
        error: 'This Viva round has started and its panels can no longer be changed.',
      };
    }
    if (panelRevision(round.panelRevision) !== input.panelRevision) {
      return {
        success: false,
        reason: 'concurrent-change',
        error: 'Another administrator changed these panels. Reload before saving your changes.',
      };
    }

    const validationError = await validatePanelsForSave(input, round, session);
    if (validationError) {
      return { success: false, reason: 'invalid', error: validationError };
    }

    const revisionFilter = input.panelRevision === 0
      ? { $or: [{ panelRevision: 0 }, { panelRevision: { $exists: false } }] }
      : { panelRevision: input.panelRevision };
    const reservedRound = await VivaRound.findOneAndUpdate(
      { _id: input.roundId, frozenAt: null, confirmedAt: null, ...revisionFilter },
      { $inc: { panelRevision: 1 } },
      { returnDocument: 'after', session }
    ).lean<VivaRoundRecord | null>();
    if (!reservedRound) {
      return {
        success: false,
        reason: 'concurrent-change',
        error: 'Another administrator changed these panels. Reload before saving your changes.',
      };
    }

    const deletedPanels = await VivaPanel.deleteMany({ roundId: input.roundId }).session(session);
    const savedPanels = input.panels.length > 0
      ? await VivaPanel.create(
          input.panels.map((panel) => ({ ...panel, roundId: input.roundId })),
          { session, ordered: true }
        )
      : [];

    if (deletedPanels.deletedCount > 0 || savedPanels.length > 0) {
      await recordVivaAuditEvent(
        {
          roundId: input.roundId,
          event: deletedPanels.deletedCount > 0 ? 'panel-updated' : 'panel-created',
          actorId: actor.id,
          actorRole: 'admin',
          actorName: actor.name,
          actorRollNo: actor.rollNo,
        },
        session
      );
    }

    return {
      success: true,
      panels: savedPanels.flatMap((panel) => {
        const serialized = serializeVivaPanel(panel.toObject());
        return serialized ? [serialized] : [];
      }),
      panelRevision: panelRevision(reservedRound.panelRevision),
    };
  });
}
