const definitions = [
  ['platform_app', process.env.MONGO_PLATFORM_USERNAME, process.env.MONGO_PLATFORM_PASSWORD],
  ['core_app', process.env.MONGO_CORE_USERNAME, process.env.MONGO_CORE_PASSWORD],
  ['exam_app', process.env.MONGO_EXAM_USERNAME, process.env.MONGO_EXAM_PASSWORD],
  ['campus_app', process.env.MONGO_CAMPUS_USERNAME, process.env.MONGO_CAMPUS_PASSWORD],
  ['iot_app', process.env.MONGO_IOT_USERNAME, process.env.MONGO_IOT_PASSWORD],
  ['notification_app', process.env.MONGO_NOTIFICATION_USERNAME, process.env.MONGO_NOTIFICATION_PASSWORD],
];
const managedUsers = db.getSiblingDB('admin').getCollection('my_platform_managed_users');

for (const [databaseName, username, password] of definitions) {
  if (!username || !password) throw new Error(`Missing MongoDB credentials for ${databaseName}`);
  const target = db.getSiblingDB(databaseName);
  const roles = [{ role: 'readWrite', db: databaseName }];
  if (target.getUser(username)) target.updateUser(username, { pwd: password, roles });
  else target.createUser({ user: username, pwd: password, roles });

  const previous = managedUsers.findOne({ _id: databaseName });
  if (previous?.username && previous.username !== username && target.getUser(previous.username)) {
    target.dropUser(previous.username);
  }
  managedUsers.updateOne(
    { _id: databaseName },
    { $set: { username, updatedAt: new Date() } },
    { upsert: true }
  );
}

const backupUsername = process.env.MONGO_BACKUP_USERNAME;
const backupPassword = process.env.MONGO_BACKUP_PASSWORD;
if (!backupUsername || !backupPassword) throw new Error('Missing MongoDB backup credentials');

const adminDb = db.getSiblingDB('admin');
const backupRoles = [
  { role: 'backup', db: 'admin' },
  { role: 'restore', db: 'admin' },
];
if (adminDb.getUser(backupUsername)) {
  adminDb.updateUser(backupUsername, { pwd: backupPassword, roles: backupRoles });
} else {
  adminDb.createUser({ user: backupUsername, pwd: backupPassword, roles: backupRoles });
}

const previousBackup = managedUsers.findOne({ _id: 'backup' });
if (
  previousBackup?.username
  && previousBackup.username !== backupUsername
  && adminDb.getUser(previousBackup.username)
) {
  adminDb.dropUser(previousBackup.username);
}
managedUsers.updateOne(
  { _id: 'backup' },
  { $set: { username: backupUsername, updatedAt: new Date() } },
  { upsert: true }
);
