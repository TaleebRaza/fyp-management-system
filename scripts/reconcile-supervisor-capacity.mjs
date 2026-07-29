import mongoose from 'mongoose';

const shouldRepair = process.argv.includes('--repair');
const uri = process.env.MONGODB_URI;

if (shouldRepair && process.env.CONFIRM_CAPACITY_REPAIR !== 'supervisor-capacity') {
  console.error('Capacity repair requires CONFIRM_CAPACITY_REPAIR=supervisor-capacity. No changes were made.');
  process.exit(1);
}
if (!uri) {
  console.error('MONGODB_URI is required. No database changes were made.');
  process.exit(1);
}

await mongoose.connect(uri);

try {
  const users = mongoose.connection.collection('users');
  const projects = mongoose.connection.collection('projects');
  const supervisors = await users
    .find({ role: 'supervisor' }, { projection: { _id: 1, occupiedSlots: 1 } })
    .toArray();
  const occupiedRows = await projects.aggregate([
    { $match: { supervisorId: { $type: 'objectId' } } },
    { $group: { _id: '$supervisorId', occupiedSlots: { $sum: 1 } } },
  ]).toArray();
  const occupiedBySupervisor = new Map(
    occupiedRows.map((row) => [String(row._id), row.occupiedSlots])
  );
  const mismatches = supervisors.flatMap((supervisor) => {
    const occupiedSlots = occupiedBySupervisor.get(String(supervisor._id)) || 0;
    return supervisor.occupiedSlots === occupiedSlots ? [] : [{
      supervisorId: String(supervisor._id),
      stored: supervisor.occupiedSlots ?? null,
      canonical: occupiedSlots,
    }];
  });

  console.log(JSON.stringify({
    mode: shouldRepair ? 'repair' : 'report',
    supervisors: supervisors.length,
    mismatches,
  }, null, 2));

  if (shouldRepair && mismatches.length > 0) {
    await users.bulkWrite(mismatches.map((mismatch) => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(mismatch.supervisorId) },
        update: { $set: { occupiedSlots: mismatch.canonical } },
      },
    })));
    console.log(JSON.stringify({ repaired: mismatches.length }));
  }
  if (!shouldRepair && mismatches.length > 0) process.exitCode = 2;
} finally {
  await mongoose.disconnect();
}
