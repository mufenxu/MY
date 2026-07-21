import { MongoClient } from "mongodb";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function withoutMongoId(row) {
  if (!row) return null;
  const { _id, ...value } = row;
  return value;
}

export class CampusRepository {
  constructor({
    uri = process.env.CAMPUS_MONGODB_URI || process.env.MONGODB_URI,
    databaseName = process.env.CAMPUS_MONGODB_DATABASE || "campus_app",
    client = null
  } = {}) {
    this.uri = uri;
    this.databaseName = databaseName;
    this.client = client;
    this.ownsClient = !client;
    this.db = null;
  }

  async initialize() {
    if (!this.uri && !this.client) throw new Error("CAMPUS_MONGODB_URI is required.");
    if (!this.client) {
      this.client = new MongoClient(this.uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000
      });
      await this.client.connect();
    }
    this.db = this.client.db(this.databaseName);
    await Promise.all([
      this.db.collection("users").createIndex({ id: 1 }, { unique: true }),
      this.db.collection("users").createIndex({ username: 1 }, { unique: true }),
      this.db.collection("users").createIndex({ created_at: 1 }),
      this.db.collection("school_sessions").createIndex({ user_id: 1 }, { unique: true }),
      this.db.collection("academic_caches").createIndex({ user_id: 1, source_key: 1 }, { unique: true }),
      this.db.collection("calendar_subscriptions").createIndex({ user_id: 1 }, { unique: true }),
      this.db.collection("calendar_subscriptions").createIndex({ token_hash: 1 }, { unique: true }),
      this.db.collection("reminder_preferences").createIndex({ user_id: 1 }, { unique: true }),
      this.db.collection("invites").createIndex({ id: 1 }, { unique: true }),
      this.db.collection("invites").createIndex({ code_hash: 1 }, { unique: true }),
      this.db.collection("invites").createIndex({ created_at: -1 })
    ]);
  }

  async ping() {
    if (!this.db) return false;
    return (await this.db.command({ ping: 1 })).ok === 1;
  }

  async close() {
    if (this.client && this.ownsClient) await this.client.close();
    this.client = null;
    this.db = null;
  }

  async countUsers() {
    return this.db.collection("users").countDocuments();
  }

  async insertUser(user, { session } = {}) {
    await this.db.collection("users").insertOne({ _id: user.id, ...clone(user) }, { session });
    return clone(user);
  }

  async findUserById(id, { session } = {}) {
    if (!id) return null;
    return withoutMongoId(await this.db.collection("users").findOne({ id: String(id) }, { session }));
  }

  async findUserByUsername(username, { session } = {}) {
    if (!username) return null;
    return withoutMongoId(await this.db.collection("users").findOne({ username }, { session }));
  }

  async findFirstUser() {
    return withoutMongoId(await this.db.collection("users").findOne({}, { sort: { created_at: 1 } }));
  }

  async listActiveUsers() {
    const rows = await this.db.collection("users")
      .find({ disabled: { $ne: 1 } }, { projection: { _id: 0 } })
      .sort({ created_at: 1 })
      .toArray();
    return rows;
  }

  async listUsersWithSessions() {
    const rows = await this.db.collection("users").aggregate([
      { $sort: { created_at: 1 } },
      {
        $lookup: {
          from: "school_sessions",
          localField: "id",
          foreignField: "user_id",
          as: "school_session"
        }
      },
      {
        $set: {
          school_session_updated_at: { $arrayElemAt: ["$school_session.updated_at", 0] },
          school_session_jar_json: { $arrayElemAt: ["$school_session.jar_json", 0] },
          has_school_session: { $cond: [{ $gt: [{ $size: "$school_session" }, 0] }, 1, 0] }
        }
      },
      { $unset: ["_id", "school_session"] }
    ]).toArray();
    return rows;
  }

  async updateUserLogin(id, timestamp) {
    await this.db.collection("users").updateOne(
      { id },
      { $set: { last_login_at: timestamp, updated_at: timestamp } }
    );
  }

  async setUserDisabled(id, disabled, timestamp) {
    await this.db.collection("users").updateOne(
      { id },
      { $set: { disabled: disabled ? 1 : 0, updated_at: timestamp }, $inc: { session_version: 1 } }
    );
  }

  async bumpSessionVersion(id, timestamp) {
    await this.db.collection("users").updateOne(
      { id },
      { $set: { updated_at: timestamp }, $inc: { session_version: 1 } }
    );
  }

  async setUserPassword(id, passwordHash, timestamp) {
    await this.db.collection("users").updateOne(
      { id },
      { $set: { password_hash: passwordHash, updated_at: timestamp }, $inc: { session_version: 1 } }
    );
  }

  async deleteUser(id) {
    const session = this.client.startSession();
    try {
      await session.withTransaction(async () => {
        await this.db.collection("school_sessions").deleteMany({ user_id: id }, { session });
        await this.db.collection("academic_caches").deleteMany({ user_id: id }, { session });
        await this.db.collection("calendar_subscriptions").deleteMany({ user_id: id }, { session });
        await this.db.collection("reminder_preferences").deleteMany({ user_id: id }, { session });
        await this.db.collection("invites").updateMany(
          { created_by: id },
          { $set: { created_by: null } },
          { session }
        );
        await this.db.collection("invites").updateMany(
          { used_by: id },
          { $set: { used_by: null } },
          { session }
        );
        await this.db.collection("users").deleteOne({ id }, { session });
      });
    } finally {
      await session.endSession();
    }
  }

  async listInvites() {
    return this.db.collection("invites").aggregate([
      { $sort: { created_at: -1 } },
      { $limit: 100 },
      { $lookup: { from: "users", localField: "created_by", foreignField: "id", as: "creator" } },
      { $lookup: { from: "users", localField: "used_by", foreignField: "id", as: "used_user" } },
      {
        $set: {
          created_by_username: { $arrayElemAt: ["$creator.username", 0] },
          used_by_username: { $arrayElemAt: ["$used_user.username", 0] }
        }
      },
      { $unset: ["_id", "creator", "used_user"] }
    ]).toArray();
  }

  async insertInvite(invite) {
    await this.db.collection("invites").insertOne({ _id: invite.id, ...clone(invite) });
    return clone(invite);
  }

  async findInviteById(id, { session } = {}) {
    return withoutMongoId(await this.db.collection("invites").findOne({ id }, { session }));
  }

  async findInviteByHash(codeHash, { session } = {}) {
    return withoutMongoId(await this.db.collection("invites").findOne({ code_hash: codeHash }, { session }));
  }

  async revokeInvite(id, timestamp) {
    await this.db.collection("invites").updateOne({ id }, { $set: { revoked_at: timestamp } });
    return this.findInviteById(id);
  }

  async deleteInvite(id) {
    const row = await this.findInviteById(id);
    if (row) await this.db.collection("invites").deleteOne({ id });
    return row;
  }

  async registerWithInvite({ codeHash, user, timestamp, inviteIsActive }) {
    const session = this.client.startSession();
    let result = null;
    try {
      await session.withTransaction(async () => {
        const invite = await this.findInviteByHash(codeHash, { session });
        if (!invite || !inviteIsActive(invite)) return;
        await this.insertUser({ ...user, role: invite.role }, { session });
        const updated = await this.db.collection("invites").updateOne(
          { id: invite.id, used_at: null, revoked_at: null },
          { $set: { used_by: user.id, used_at: timestamp } },
          { session }
        );
        if (updated.modifiedCount !== 1) throw new Error("INVITE_CONCURRENTLY_CONSUMED");
        result = { ...user, role: invite.role };
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  async getSchoolSession(userId) {
    return withoutMongoId(await this.db.collection("school_sessions").findOne({ user_id: userId }));
  }

  async listSchoolSessions() {
    return this.db.collection("school_sessions").find({}, { projection: { _id: 0 } }).toArray();
  }

  async upsertSchoolSession(userId, jarJson, timestamp) {
    await this.db.collection("school_sessions").updateOne(
      { user_id: userId },
      {
        $set: { user_id: userId, jar_json: jarJson, updated_at: timestamp },
        $inc: { version: 1 }
      },
      { upsert: true }
    );
  }

  async replaceSchoolSessionIfVersion(userId, expectedVersion, jarJson, timestamp) {
    const collection = this.db.collection("school_sessions");
    if (expectedVersion === null) {
      try {
        const result = await collection.updateOne(
          { user_id: userId, version: { $exists: false } },
          { $set: { user_id: userId, jar_json: jarJson, updated_at: timestamp, version: 1 } },
          { upsert: true }
        );
        return result.matchedCount === 1 || result.upsertedCount === 1;
      } catch (error) {
        if (error?.code === 11000) return false;
        throw error;
      }
    }

    const versionFilter = expectedVersion === 0
      ? { $or: [{ version: 0 }, { version: null }, { version: { $exists: false } }] }
      : { version: expectedVersion };
    const result = await collection.updateOne(
      { user_id: userId, ...versionFilter },
      {
        $set: {
          user_id: userId,
          jar_json: jarJson,
          updated_at: timestamp,
          version: expectedVersion + 1
        }
      }
    );
    return result.matchedCount === 1;
  }

  async deleteSchoolSession(userId) {
    await this.db.collection("school_sessions").deleteOne({ user_id: userId });
  }

  async getAcademicCache(userId, sourceKey) {
    return withoutMongoId(await this.db.collection("academic_caches").findOne({ user_id: userId, source_key: sourceKey }));
  }

  async listAcademicCaches() {
    return this.db.collection("academic_caches").find({}, { projection: { _id: 0 } }).toArray();
  }

  async upsertAcademicCache(userId, sourceKey, cacheJson, timestamp) {
    await this.db.collection("academic_caches").updateOne(
      { user_id: userId, source_key: sourceKey },
      { $set: { user_id: userId, source_key: sourceKey, cache_json: cacheJson, updated_at: timestamp } },
      { upsert: true }
    );
  }

  async getCalendarSubscription(userId) {
    return withoutMongoId(await this.db.collection("calendar_subscriptions").findOne({ user_id: userId }));
  }

  async findCalendarSubscriptionByTokenHash(tokenHash) {
    return withoutMongoId(await this.db.collection("calendar_subscriptions").findOne({ token_hash: tokenHash, enabled: true }));
  }

  async listCalendarSubscriptions() {
    return this.db.collection("calendar_subscriptions").find({}, { projection: { _id: 0 } }).toArray();
  }

  async upsertCalendarSubscription(userId, { tokenHash, tokenJson, enabled = true, timestamp }) {
    await this.db.collection("calendar_subscriptions").updateOne(
      { user_id: userId },
      {
        $set: {
          user_id: userId,
          token_hash: tokenHash,
          token_json: tokenJson,
          enabled: Boolean(enabled),
          updated_at: timestamp
        },
        $setOnInsert: { created_at: timestamp }
      },
      { upsert: true }
    );
    return this.getCalendarSubscription(userId);
  }

  async disableCalendarSubscription(userId, timestamp) {
    await this.db.collection("calendar_subscriptions").updateOne(
      { user_id: userId },
      { $set: { enabled: false, updated_at: timestamp } }
    );
    return this.getCalendarSubscription(userId);
  }

  async getReminderPreference(userId) {
    return withoutMongoId(await this.db.collection("reminder_preferences").findOne({ user_id: userId }));
  }

  async listEnabledReminderPreferences() {
    return this.db.collection("reminder_preferences")
      .find({ enabled: true, recipient_id: { $type: "string", $ne: "" } }, { projection: { _id: 0 } })
      .toArray();
  }

  async upsertReminderPreference(userId, preference, timestamp) {
    await this.db.collection("reminder_preferences").updateOne(
      { user_id: userId },
      {
        $set: {
          user_id: userId,
          enabled: Boolean(preference.enabled),
          recipient_id: String(preference.recipientId || ""),
          lead_minutes: Number(preference.leadMinutes),
          updated_at: timestamp
        },
        $setOnInsert: { created_at: timestamp }
      },
      { upsert: true }
    );
    return this.getReminderPreference(userId);
  }
}

export class MemoryCampusRepository {
  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.caches = new Map();
    this.invites = new Map();
    this.calendarSubscriptions = new Map();
    this.reminderPreferences = new Map();
  }

  async initialize() {}
  async ping() { return true; }
  async close() {}
  async countUsers() { return this.users.size; }

  async insertUser(user) {
    if (Array.from(this.users.values()).some((row) => row.username === user.username)) {
      const error = new Error("duplicate username");
      error.code = 11000;
      throw error;
    }
    this.users.set(user.id, clone(user));
    return clone(user);
  }

  async findUserById(id) { return clone(this.users.get(String(id)) || null); }
  async findUserByUsername(username) { return clone(Array.from(this.users.values()).find((row) => row.username === username) || null); }
  async findFirstUser() { return clone(Array.from(this.users.values()).sort((a, b) => a.created_at.localeCompare(b.created_at))[0] || null); }
  async listActiveUsers() { return clone(Array.from(this.users.values()).filter((row) => !row.disabled).sort((a, b) => a.created_at.localeCompare(b.created_at))); }

  async listUsersWithSessions() {
    return clone(Array.from(this.users.values()).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((user) => {
      const session = this.sessions.get(user.id);
      return {
        ...user,
        school_session_updated_at: session?.updated_at || null,
        school_session_jar_json: session?.jar_json || null,
        has_school_session: session ? 1 : 0
      };
    }));
  }

  async updateUserLogin(id, timestamp) { const row = this.users.get(id); if (row) Object.assign(row, { last_login_at: timestamp, updated_at: timestamp }); }
  async setUserDisabled(id, disabled, timestamp) { const row = this.users.get(id); if (row) Object.assign(row, { disabled: disabled ? 1 : 0, updated_at: timestamp, session_version: (row.session_version || 1) + 1 }); }
  async bumpSessionVersion(id, timestamp) { const row = this.users.get(id); if (row) Object.assign(row, { updated_at: timestamp, session_version: (row.session_version || 1) + 1 }); }
  async setUserPassword(id, hash, timestamp) { const row = this.users.get(id); if (row) Object.assign(row, { password_hash: hash, updated_at: timestamp, session_version: (row.session_version || 1) + 1 }); }

  async deleteUser(id) {
    this.users.delete(id);
    this.sessions.delete(id);
    for (const key of this.caches.keys()) if (key.startsWith(`${id}:`)) this.caches.delete(key);
    this.calendarSubscriptions.delete(id);
    this.reminderPreferences.delete(id);
  }

  async listInvites() {
    return clone(Array.from(this.invites.values()).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100).map((invite) => ({
      ...invite,
      created_by_username: this.users.get(invite.created_by)?.username || null,
      used_by_username: this.users.get(invite.used_by)?.username || null
    })));
  }

  async insertInvite(invite) { this.invites.set(invite.id, clone(invite)); return clone(invite); }
  async findInviteById(id) { return clone(this.invites.get(id) || null); }
  async findInviteByHash(hash) { return clone(Array.from(this.invites.values()).find((row) => row.code_hash === hash) || null); }
  async revokeInvite(id, timestamp) { const row = this.invites.get(id); if (row) row.revoked_at = timestamp; return clone(row || null); }
  async deleteInvite(id) { const row = this.invites.get(id); this.invites.delete(id); return clone(row || null); }

  async registerWithInvite({ codeHash, user, timestamp, inviteIsActive }) {
    const invite = await this.findInviteByHash(codeHash);
    if (!invite || !inviteIsActive(invite)) return null;
    await this.insertUser({ ...user, role: invite.role });
    Object.assign(this.invites.get(invite.id), { used_by: user.id, used_at: timestamp });
    return clone({ ...user, role: invite.role });
  }

  async getSchoolSession(userId) { return clone(this.sessions.get(userId) || null); }
  async listSchoolSessions() { return clone(Array.from(this.sessions.values())); }
  async upsertSchoolSession(userId, jarJson, timestamp) {
    const current = this.sessions.get(userId);
    this.sessions.set(userId, {
      user_id: userId,
      jar_json: jarJson,
      updated_at: timestamp,
      version: Number(current?.version || 0) + 1
    });
  }
  async replaceSchoolSessionIfVersion(userId, expectedVersion, jarJson, timestamp) {
    const current = this.sessions.get(userId);
    if (!current && expectedVersion !== null) return false;
    if (current && expectedVersion === null) return false;
    const currentVersion = Number(current?.version || 0);
    if (expectedVersion !== null && currentVersion !== expectedVersion) return false;
    this.sessions.set(userId, {
      user_id: userId,
      jar_json: jarJson,
      updated_at: timestamp,
      version: currentVersion + 1
    });
    return true;
  }
  async deleteSchoolSession(userId) { this.sessions.delete(userId); }
  async getAcademicCache(userId, sourceKey) { return clone(this.caches.get(`${userId}:${sourceKey}`) || null); }
  async listAcademicCaches() { return clone(Array.from(this.caches.values())); }
  async upsertAcademicCache(userId, sourceKey, cacheJson, timestamp) { this.caches.set(`${userId}:${sourceKey}`, { user_id: userId, source_key: sourceKey, cache_json: cacheJson, updated_at: timestamp }); }
  async getCalendarSubscription(userId) { return clone(this.calendarSubscriptions.get(userId) || null); }
  async findCalendarSubscriptionByTokenHash(tokenHash) { return clone(Array.from(this.calendarSubscriptions.values()).find((row) => row.token_hash === tokenHash && row.enabled) || null); }
  async listCalendarSubscriptions() { return clone(Array.from(this.calendarSubscriptions.values())); }
  async upsertCalendarSubscription(userId, { tokenHash, tokenJson, enabled = true, timestamp }) {
    const current = this.calendarSubscriptions.get(userId);
    const row = { user_id: userId, token_hash: tokenHash, token_json: tokenJson, enabled: Boolean(enabled), created_at: current?.created_at || timestamp, updated_at: timestamp };
    this.calendarSubscriptions.set(userId, row);
    return clone(row);
  }
  async disableCalendarSubscription(userId, timestamp) {
    const row = this.calendarSubscriptions.get(userId);
    if (row) Object.assign(row, { enabled: false, updated_at: timestamp });
    return clone(row || null);
  }
  async getReminderPreference(userId) { return clone(this.reminderPreferences.get(userId) || null); }
  async listEnabledReminderPreferences() { return clone(Array.from(this.reminderPreferences.values()).filter((row) => row.enabled && row.recipient_id)); }
  async upsertReminderPreference(userId, preference, timestamp) {
    const current = this.reminderPreferences.get(userId);
    const row = { user_id: userId, enabled: Boolean(preference.enabled), recipient_id: String(preference.recipientId || ""), lead_minutes: Number(preference.leadMinutes), created_at: current?.created_at || timestamp, updated_at: timestamp };
    this.reminderPreferences.set(userId, row);
    return clone(row);
  }
}

export function createCampusRepository() {
  return process.env.HGU_STORAGE_DRIVER === "memory"
    ? new MemoryCampusRepository()
    : new CampusRepository();
}
