import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ s3Send: vi.fn() }));

vi.mock('@aws-sdk/client-s3', () => ({
  DeleteObjectCommand: vi.fn(function (input) { return input; }),
}));
vi.mock('../lib/s3-client', () => ({
  BUCKET_NAME: 'test-bucket',
  s3Client: { send: mocks.s3Send },
}));

import { deleteR2Targets } from '../lib/r2Deletion';

describe('R2 deletion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deduplicates targets and retries a transient failed deletion before succeeding', async () => {
    mocks.s3Send.mockRejectedValueOnce(new Error('temporary')).mockResolvedValue({});

    await expect(
      deleteR2Targets([
        { key: 'proposal.pdf', size: 10 },
        { key: 'proposal.pdf', size: 20 },
      ])
    ).resolves.toBeUndefined();

    expect(mocks.s3Send).toHaveBeenCalledTimes(2);
  });

  it('fails without allowing a caller to adjust the ledger when every retry fails', async () => {
    mocks.s3Send.mockRejectedValue(new Error('unavailable'));

    await expect(deleteR2Targets([{ key: 'proposal.pdf', size: 10 }])).rejects.toThrow('unavailable');
    expect(mocks.s3Send).toHaveBeenCalledTimes(2);
  });
});
