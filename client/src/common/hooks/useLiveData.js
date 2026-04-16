import { useState, useEffect, useCallback, useRef } from "react";
import { useEventBus } from "@/common/contexts/EventContext.jsx";

export const useLiveData = (fetchFn, events, { pollingInterval = 30000, initialData = null } = {}) => {
    const [data, setData] = useState(initialData);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const eventBus = useEventBus();
    const mountedRef = useRef(true);
    const debounceRef = useRef(null);
    const fetchingRef = useRef(false);

    const refresh = useCallback(async () => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;
        try {
            const result = await fetchFn();
            if (mountedRef.current) {
                setData(result);
                setError(null);
            }
        } catch (err) {
            if (mountedRef.current) setError(err);
        } finally {
            fetchingRef.current = false;
            if (mountedRef.current) setLoading(false);
        }
    }, [fetchFn]);

    const debouncedRefresh = useCallback(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            debounceRef.current = null;
            refresh();
        }, 100);
    }, [refresh]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        if (!eventBus) return;
        const eventList = Array.isArray(events) ? events : [events];
        const unsubs = eventList.map(event => eventBus.subscribe(event, debouncedRefresh));
        return () => unsubs.forEach(unsub => unsub());
    }, [eventBus, events, debouncedRefresh]);

    useEffect(() => {
        if (!pollingInterval) return;
        const interval = setInterval(refresh, pollingInterval);
        return () => clearInterval(interval);
    }, [refresh, pollingInterval]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    return { data, loading, error, refresh };
};
