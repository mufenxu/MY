import { useCallback, useEffect, useRef, useState } from 'react';

export function useLatestRequest() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestRef = useRef(null);

  const runRequest = useCallback(async (request, onSuccess) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const result = await request(controller.signal);
      if (requestRef.current === controller) onSuccess(result);
    } catch (requestError) {
      if (requestRef.current === controller && requestError.code !== 'REQUEST_ABORTED') setError(requestError.message);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => () => {
    const controller = requestRef.current;
    requestRef.current = null;
    controller?.abort();
  }, []);

  return { loading, error, setError, runRequest };
}
