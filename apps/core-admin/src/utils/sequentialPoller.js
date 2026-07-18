export function createSequentialPoller(task, options = {}) {
    const interval = Math.max(Number(options.interval) || 2000, 250);
    let timer = 0;
    let controller = null;
    let stopped = true;

    const schedule = (delay = interval) => {
        if (!stopped) timer = window.setTimeout(run, delay);
    };

    const run = async () => {
        if (stopped) return;
        const activeController = new AbortController();
        controller = activeController;
        let shouldContinue = true;
        try {
            shouldContinue = await task(activeController.signal) !== false;
        } catch (error) {
            if (!activeController.signal.aborted) shouldContinue = options.onError?.(error) !== false;
        } finally {
            if (controller === activeController) controller = null;
            if (shouldContinue) schedule();
            else stopped = true;
        }
    };

    return {
        start({ immediate = false } = {}) {
            this.stop();
            stopped = false;
            schedule(immediate ? 0 : interval);
        },
        stop() {
            stopped = true;
            window.clearTimeout(timer);
            timer = 0;
            controller?.abort();
            controller = null;
        },
    };
}
