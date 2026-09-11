import http from 'node:http';

// Keep the existing HTTP/auth/proxy contract while sharing one Node process.
export function createEmbeddedServices({ core, exam, targets }) {
  const services = [
    { id: 'core', app: core.app, initialize: core.initializeCoreRuntime, stop: core.closeCoreRuntime, ready: core.isCoreRuntimeReady },
    { id: 'exam', app: exam.app, initialize: exam.initializeExamRuntime, stop: exam.closeExamRuntime, ready: exam.isExamRuntimeReady },
  ].map((service) => ({ ...service, server: http.createServer(service.app), target: new URL(targets[service.id]) }));
  let stopping = false;
  let startPromise;
  let closePromise;
  let disposePromise;

  function dispose() {
    disposePromise ||= (async () => {
      await Promise.all(services.map(({ server }) => new Promise((resolve) => {
        if (!server.listening) return resolve();
        const timer = setTimeout(() => server.closeAllConnections(), 10_000);
        timer.unref();
        server.close(() => { clearTimeout(timer); resolve(); });
        server.closeIdleConnections();
      })));
      const results = await Promise.allSettled(services.map(({ stop }) => Promise.resolve().then(stop)));
      const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
      if (errors.length) throw new AggregateError(errors, '主后端业务模块关闭失败。');
    })();
    return disposePromise;
  }

  function start() {
    if (stopping) return Promise.reject(new Error('主后端正在关闭。'));
    startPromise ||= (async () => {
      try {
        // Wait for both initializers to settle before cleanup, including partial failures.
        const initialized = await Promise.allSettled(services.map(({ initialize }) => Promise.resolve().then(initialize)));
        const errors = initialized.filter((result) => result.status === 'rejected').map((result) => result.reason);
        if (errors.length) throw new AggregateError(errors, '主后端业务模块初始化失败。');
        if (stopping) throw new Error('主后端正在关闭。');
        const listening = await Promise.allSettled(services.map(({ server, target }) => new Promise((resolve, reject) => {
          const onError = (error) => reject(error);
          server.once('error', onError);
          server.listen(Number(target.port), target.hostname, () => {
            server.off('error', onError);
            resolve();
          });
        })));
        const listenErrors = listening.filter((result) => result.status === 'rejected').map((result) => result.reason);
        if (listenErrors.length) throw new AggregateError(listenErrors, '主后端内部接口启动失败。');
      } catch (error) {
        stopping = true;
        try { await dispose(); } catch (closeError) {
          throw new AggregateError([error, closeError], '主后端启动及清理失败。');
        }
        throw error;
      }
    })();
    return startPromise;
  }

  function close() {
    stopping = true;
    closePromise ||= (async () => {
      await startPromise?.catch(() => {});
      await dispose();
    })();
    return closePromise;
  }

  return {
    start,
    close,
    isReady: () => !stopping && services.every(({ server, ready }) => server.listening && ready()),
  };
}
