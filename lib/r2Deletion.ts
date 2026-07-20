import { DeleteObjectCommand } from '@aws-sdk/client-s3';

import { BUCKET_NAME, s3Client } from './s3-client';
import { dedupeR2DeletionTargets, type R2DeletionTarget } from './r2Cleanup';

const DELETE_ATTEMPTS = 2;

export async function deleteR2Targets(targets: R2DeletionTarget[]) {
  const uniqueTargets = dedupeR2DeletionTargets(targets);

  await Promise.all(
    uniqueTargets.map(async target => {
      let lastError: unknown;

      for (let attempt = 0; attempt < DELETE_ATTEMPTS; attempt++) {
        try {
          await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: target.key }));
          return;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError;
    })
  );
}
