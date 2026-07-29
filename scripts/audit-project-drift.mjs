import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI is required. This audit is read-only and made no changes.');
  process.exit(1);
}

async function countAndSample(collection, pipeline) {
  const [result] = await collection.aggregate([
    ...pipeline,
    {
      $facet: {
        count: [{ $count: 'total' }],
        samples: [{ $limit: 20 }],
      },
    },
  ]).toArray();

  return {
    count: result.count[0]?.total || 0,
    samples: result.samples,
  };
}

await mongoose.connect(uri);

try {
  const users = mongoose.connection.collection('users');
  const projects = mongoose.connection.collection('projects');

  const [projectMembers, userProjects, projections] = await Promise.all([
    countAndSample(projects, [
      { $unwind: '$members' },
      {
        $lookup: {
          from: 'users',
          localField: 'members',
          foreignField: '_id',
          as: 'member',
        },
      },
      { $unwind: { path: '$member', preserveNullAndEmptyArrays: true } },
      { $match: { $expr: { $ne: ['$member.projectId', '$_id'] } } },
      { $project: { _id: 0, projectId: '$_id', memberId: '$members', userProjectId: '$member.projectId' } },
    ]),
    countAndSample(users, [
      { $match: { role: 'student', projectId: { $type: 'objectId' } } },
      {
        $lookup: {
          from: 'projects',
          let: { projectId: '$projectId', studentId: '$_id' },
          pipeline: [{ $match: { $expr: { $and: [
            { $eq: ['$_id', '$$projectId'] },
            { $in: ['$$studentId', '$members'] },
          ] } } }],
          as: 'project',
        },
      },
      { $match: { $expr: { $eq: [{ $size: '$project' }, 0] } } },
      { $project: { _id: 0, studentId: '$_id', projectId: 1 } },
    ]),
    countAndSample(users, [
      { $match: { role: 'student', projectId: { $type: 'objectId' } } },
      {
        $lookup: {
          from: 'projects',
          localField: 'projectId',
          foreignField: '_id',
          as: 'project',
        },
      },
      { $unwind: '$project' },
      {
        $match: {
          $expr: {
            $or: [
              { $ne: ['$supervisorId', '$project.supervisorId'] },
              { $ne: [{ $ifNull: ['$status', ''] }, { $ifNull: ['$project.status', ''] }] },
              { $ne: [{ $ifNull: ['$projectTitle', ''] }, { $ifNull: ['$project.title', ''] }] },
              { $ne: [{ $ifNull: ['$pdfUrl', ''] }, { $ifNull: ['$project.pdfUrl', ''] }] },
              { $not: [{ $setEquals: [{ $ifNull: ['$domains', []] }, { $ifNull: ['$project.domains', []] }] }] },
            ],
          },
        },
      },
      { $project: { _id: 0, studentId: '$_id', projectId: 1 } },
    ]),
  ]);

  console.log(JSON.stringify({
    mode: 'report',
    projectMembers,
    userProjects,
    projections,
  }, null, 2));
} finally {
  await mongoose.disconnect();
}
