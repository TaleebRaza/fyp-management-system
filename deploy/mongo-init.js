const replicaSetName = process.env.MONGODB_REPLICA_SET;
const databaseName = process.env.MONGODB_DATABASE;
const applicationUsername = process.env.MONGODB_APP_USERNAME;
const applicationPassword = process.env.MONGODB_APP_PASSWORD;

for (const [name, value] of Object.entries({
  MONGODB_REPLICA_SET: replicaSetName,
  MONGODB_DATABASE: databaseName,
  MONGODB_APP_USERNAME: applicationUsername,
  MONGODB_APP_PASSWORD: applicationPassword,
})) {
  if (!value) throw new Error(`${name} is required.`);
}

if (!/^[A-Za-z0-9_-]{1,64}$/.test(replicaSetName)) {
  throw new Error('MONGODB_REPLICA_SET must contain only letters, numbers, underscores, or hyphens.');
}
if (!/^[A-Za-z0-9_-]{1,64}$/.test(databaseName)) {
  throw new Error('MONGODB_DATABASE must contain only letters, numbers, underscores, or hyphens.');
}
if (!/^[A-Za-z0-9._-]{1,64}$/.test(applicationUsername)) {
  throw new Error('MONGODB_APP_USERNAME must contain only letters, numbers, dots, underscores, or hyphens.');
}

try {
  rs.status();
} catch (error) {
  if (error?.code !== 94) throw error;
  rs.initiate({
    _id: replicaSetName,
    members: [{ _id: 0, host: 'mongo:27017' }],
  });
}

for (let attempt = 0; attempt < 60; attempt += 1) {
  if (db.hello().isWritablePrimary) break;
  if (attempt === 59) throw new Error('MongoDB replica set did not elect a primary.');
  sleep(1000);
}

const applicationDatabase = db.getSiblingDB(databaseName);
if (!applicationDatabase.getUser(applicationUsername)) {
  applicationDatabase.createUser({
    user: applicationUsername,
    pwd: applicationPassword,
    roles: [{ role: 'readWrite', db: databaseName }],
  });
}
