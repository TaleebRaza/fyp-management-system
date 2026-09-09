import { processEmailOutbox } from './emailOutbox';
import {
  expireUploadReservations,
  processStorageDeletionOutbox,
} from './storageProtocol';

export async function processEssentialBackgroundWork() {
  const [storageWork, emails] = await Promise.all([
    processStorageBackgroundWork(),
    processEmailOutbox(),
  ]);

  return { ...storageWork, emails };
}

export async function processStorageBackgroundWork() {
  const [reservations, storageDeletions] = await Promise.all([
    expireUploadReservations(),
    processStorageDeletionOutbox(),
  ]);

  return { reservations, storageDeletions };
}
