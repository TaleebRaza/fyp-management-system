import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';

import connectToDatabase from '../../../../lib/mongodb';
import { requireRole } from '../../../../lib/routeAuth';
import { BUCKET_NAME, s3Client } from '../../../../lib/s3-client';
import { reconcileStorage, type StorageObject, type StorageReference } from '../../../../lib/storageReconciliation';
import Project from '../../../../models/Project';
import SystemConfig from '../../../../models/SystemConfig';
import User from '../../../../models/User';
import VoiceNote from '../../../../models/VoiceNote';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authorization = await requireRole(req, ['admin']);
  if (authorization.kind === 'denied') return authorization.response;

  try {
    await connectToDatabase();

    const [config, projects, voiceNotes, broadcasts] = await Promise.all([
      SystemConfig.findOne({ configKey: 'storage' }).lean(),
      Project.find({ pdfUrl: { $nin: ['', null] } }).select('pdfUrl pdfSize').lean(),
      VoiceNote.find({ blobUrl: { $nin: ['', null] } }).select('blobUrl fileSize').lean(),
      User.find({
        role: 'supervisor',
        broadcastType: 'audio',
        broadcastContent: { $nin: ['', null] },
      })
        .select('broadcastContent broadcastSize')
        .lean(),
    ]);

    const references: StorageReference[] = [
      ...projects.map(project => ({ key: project.pdfUrl, size: project.pdfSize })),
      ...voiceNotes.map(note => ({ key: note.blobUrl, size: note.fileSize })),
      ...broadcasts.map(broadcast => ({ key: broadcast.broadcastContent, size: broadcast.broadcastSize })),
    ];
    const objects: StorageObject[] = [];
    let continuationToken: string | undefined;

    do {
      const page = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
        })
      );
      objects.push(...(page.Contents || []).map(object => ({ key: object.Key, size: object.Size })));
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    return NextResponse.json(
      reconcileStorage(config?.usedBytes, references, objects),
      { status: 200 }
    );
  } catch (error) {
    console.error('Storage reconciliation failed:', error);
    return NextResponse.json({ error: 'Failed to reconcile storage.' }, { status: 500 });
  }
}
