export async function runWithAuthRecovery(task, {
  isAuthError,
  recover,
  maxRecoveries = 1,
  onRecovery = null
} = {}) {
  const recoveryLimit = Math.max(0, Math.floor(Number(maxRecoveries) || 0));

  for (let recoveryCount = 0; ; recoveryCount += 1) {
    try {
      return await task();
    } catch (error) {
      if (recoveryCount >= recoveryLimit || !isAuthError?.(error)) throw error;
      const attempt = recoveryCount + 1;
      await onRecovery?.({ attempt, error });
      await recover(error, attempt);
    }
  }
}
