import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI is required. This audit is read-only and made no changes.');
  process.exit(1);
}

const keyAudits = [
  { collection: 'projects', field: 'pdfUrl', prefix: 'proposals/', filter: {} },
  { collection: 'voicenotes', field: 'blobUrl', prefix: 'voicenotes/', filter: {} },
  {
    collection: 'users',
    field: 'broadcastContent',
    prefix: 'broadcasts/',
    filter: { role: 'supervisor', broadcastType: 'audio' },
  },
  {
    collection: 'users',
    field: 'studentMessageContent',
    prefix: 'student-messages/',
    filter: { role: 'student', studentMessageType: 'audio' },
  },
];

async function auditKeys({ collection: collectionName, field, prefix, filter }) {
  const collection = mongoose.connection.collection(collectionName);
  const keyPath = `$${field}`;
  const [result] = await collection.aggregate([
    { $match: { ...filter, [field]: { $type: 'string', $ne: '' } } },
    {
      $project: {
        _id: 1,
        valid: {
          $and: [
            { $lte: [{ $strLenCP: keyPath }, 500] },
            { $regexMatch: { input: keyPath, regex: `^${prefix}` } },
            { $not: [{ $regexMatch: { input: keyPath, regex: '(^|/)(?:\\.{1,2})(?:/|$)|\\\\' } }] },
          ],
        },
      },
    },
    { $match: { valid: false } },
    {
      $facet: {
        count: [{ $count: 'total' }],
        samples: [{ $limit: 20 }, { $project: { _id: 1 } }],
      },
    },
  ]).toArray();

  return {
    collection: collectionName,
    field,
    prefix,
    invalid: result.count[0]?.total || 0,
    sampleIds: result.samples.map((sample) => String(sample._id)),
  };
}

await mongoose.connect(uri);

try {
  const audits = await Promise.all(keyAudits.map(auditKeys));
  console.log(JSON.stringify({ mode: 'report', audits }, null, 2));
  if (audits.some((audit) => audit.invalid > 0)) process.exitCode = 2;
} finally {
  await mongoose.disconnect();
}
