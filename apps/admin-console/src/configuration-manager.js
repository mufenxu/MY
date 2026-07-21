export class ConfigurationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function changedKeys(current, target) {
  return Object.keys(target).filter((key) => JSON.stringify(current[key]) !== JSON.stringify(target[key]));
}

export function createConfigurationManager({
  store,
  operations,
  enforceTwoPerson = true,
  now = () => new Date(),
} = {}) {
  let applicationQueue = Promise.resolve();

  async function ensureState() {
    const settings = await operations.getSettings();
    const state = await store.ensureBaseline(settings);
    return { settings, state };
  }

  async function getOverview() {
    const { settings, state } = await ensureState();
    const [changes, versions] = await Promise.all([store.listChanges(50), store.listVersions(20)]);
    return { settings, currentVersion: state.currentVersion, changes, versions, twoPersonApproval: enforceTwoPerson };
  }

  async function propose({ settings: requested, summary, actor, kind = 'change', targetVersion = null }) {
    const { settings: current, state } = await ensureState();
    const target = await operations.previewSettings(requested || {});
    const keys = changedKeys(current, target);
    if (!keys.length) throw new ConfigurationError(400, 'CONFIGURATION_UNCHANGED', 'The proposed configuration does not change any values.');
    const normalizedSummary = String(summary || '').trim().slice(0, 200);
    if (!normalizedSummary) throw new ConfigurationError(400, 'CONFIGURATION_SUMMARY_REQUIRED', 'A change summary is required.');
    return store.createChange({
      kind,
      targetVersion,
      baseVersion: state.currentVersion,
      settings: target,
      changedKeys: keys,
      summary: normalizedSummary,
      createdBy: actor,
    });
  }

  async function reject(id, actor, note = '') {
    const change = await store.getChange(id);
    if (!change) throw new ConfigurationError(404, 'CONFIGURATION_CHANGE_NOT_FOUND', 'Configuration change not found.');
    if (change.status !== 'pending') throw new ConfigurationError(409, 'CONFIGURATION_CHANGE_FINALIZED', 'Configuration change is no longer pending.');
    return store.updateChange(id, { status: 'rejected', rejectedBy: actor, rejectedAt: now().toISOString(), decisionNote: String(note || '').slice(0, 300) });
  }

  async function applyClaimed(change, actor, note) {
    const { state } = await ensureState();
    if (state.currentVersion !== change.baseVersion) {
      await store.updateChange(change.id, { status: 'conflicted', decisionNote: 'Base version is no longer current.' });
      throw new ConfigurationError(409, 'CONFIGURATION_VERSION_CONFLICT', 'The current configuration changed after this proposal was created.');
    }
    try {
      const settings = await operations.updateSettings(change.settings, actor);
      const version = state.currentVersion + 1;
      const timestamp = now().toISOString();
      await store.createVersion({
        version,
        settings,
        createdAt: timestamp,
        createdBy: actor,
        summary: change.summary,
        sourceChangeId: change.id,
        rollbackOf: change.kind === 'rollback' ? change.targetVersion : null,
      });
      await store.setState({ currentVersion: version });
      const completed = await store.updateChange(change.id, {
        status: 'applied',
        approvedBy: actor,
        approvedAt: timestamp,
        appliedAt: timestamp,
        appliedVersion: version,
        decisionNote: String(note || '').slice(0, 300),
      });
      return { change: completed, settings, version };
    } catch (error) {
      await store.updateChange(change.id, { status: 'failed', decisionNote: String(error.message || error).slice(0, 300) });
      throw error;
    }
  }

  async function approve(id, actor, note = '') {
    const execute = async () => {
      const existing = await store.getChange(id);
      if (!existing) throw new ConfigurationError(404, 'CONFIGURATION_CHANGE_NOT_FOUND', 'Configuration change not found.');
      if (existing.status !== 'pending') throw new ConfigurationError(409, 'CONFIGURATION_CHANGE_FINALIZED', 'Configuration change is no longer pending.');
      if (enforceTwoPerson && existing.createdBy === actor) {
        throw new ConfigurationError(403, 'CONFIGURATION_SELF_APPROVAL_FORBIDDEN', 'A different administrator must approve this change.');
      }
      const claimed = await store.claimChange(id);
      if (!claimed) throw new ConfigurationError(409, 'CONFIGURATION_CHANGE_FINALIZED', 'Configuration change is no longer pending.');
      return applyClaimed(claimed, actor, note);
    };
    const result = applicationQueue.then(execute, execute);
    applicationQueue = result.catch(() => {});
    return result;
  }

  async function proposeRollback(version, { actor, summary } = {}) {
    const target = await store.getVersion(Number(version));
    if (!target) throw new ConfigurationError(404, 'CONFIGURATION_VERSION_NOT_FOUND', 'Configuration version not found.');
    return propose({
      settings: target.settings,
      summary: summary || `Rollback to configuration version ${target.version}`,
      actor,
      kind: 'rollback',
      targetVersion: target.version,
    });
  }

  return { approve, getOverview, propose, proposeRollback, reject };
}
