import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";

const EventContext = createContext(null);

export const useEventBus = () => useContext(EventContext);

export const EventProvider = ({ children }) => {
    const listenersRef = useRef(new Map());
    const sourceRef = useRef(null);
    const [connected, setConnected] = useState(false);
    const reconnectTimer = useRef(null);
    const heartbeatTimer = useRef(null);
    const retriesRef = useRef(0);

    const notifyAll = useCallback(() => {
        for (const [, callbacks] of listenersRef.current) {
            for (const cb of callbacks) {
                cb({});
            }
        }
    }, []);

    const resetHeartbeat = useCallback(() => {
        if (heartbeatTimer.current) clearTimeout(heartbeatTimer.current);
        heartbeatTimer.current = setTimeout(() => {
            if (sourceRef.current) {
                sourceRef.current.close();
                sourceRef.current = null;
            }
            setConnected(false);
            scheduleReconnect();
        }, 45000);
    }, []);

    const scheduleReconnect = useCallback(() => {
        if (reconnectTimer.current) return;
        const delay = Math.min(1000 * Math.pow(2, retriesRef.current), 30000);
        retriesRef.current++;
        reconnectTimer.current = setTimeout(() => {
            reconnectTimer.current = null;
            connect();
        }, delay);
    }, []);

    const connect = useCallback(() => {
        const token = localStorage.getItem("overrideToken") || localStorage.getItem("sessionToken");
        if (!token) return;

        if (sourceRef.current) {
            sourceRef.current.close();
        }

        const source = new EventSource(`/api/service/events?token=${encodeURIComponent(token)}`);
        sourceRef.current = source;

        source.addEventListener("connected", () => {
            setConnected(true);
            retriesRef.current = 0;
            if (reconnectTimer.current) {
                clearTimeout(reconnectTimer.current);
                reconnectTimer.current = null;
            }
            resetHeartbeat();
            notifyAll();
        });

        source.addEventListener("keepalive", () => {
            resetHeartbeat();
        });

        const eventTypes = ["containers:updated", "stacks:updated", "images:updated"];
        for (const type of eventTypes) {
            source.addEventListener(type, (e) => {
                resetHeartbeat();
                const data = JSON.parse(e.data);
                const callbacks = listenersRef.current.get(type);
                if (callbacks) {
                    for (const cb of callbacks) {
                        cb(data);
                    }
                }
            });
        }

        source.onerror = () => {
            setConnected(false);
            source.close();
            sourceRef.current = null;
            if (heartbeatTimer.current) clearTimeout(heartbeatTimer.current);
            scheduleReconnect();
        };
    }, [resetHeartbeat, notifyAll, scheduleReconnect]);

    useEffect(() => {
        connect();

        const handleOnline = () => {
            if (!sourceRef.current || sourceRef.current.readyState === EventSource.CLOSED) {
                retriesRef.current = 0;
                connect();
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible" &&
                (!sourceRef.current || sourceRef.current.readyState === EventSource.CLOSED)) {
                retriesRef.current = 0;
                connect();
            }
        };

        window.addEventListener("online", handleOnline);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            if (sourceRef.current) sourceRef.current.close();
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (heartbeatTimer.current) clearTimeout(heartbeatTimer.current);
            window.removeEventListener("online", handleOnline);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [connect]);

    const subscribe = useCallback((event, callback) => {
        if (!listenersRef.current.has(event)) {
            listenersRef.current.set(event, new Set());
        }
        listenersRef.current.get(event).add(callback);
        return () => {
            const set = listenersRef.current.get(event);
            if (set) {
                set.delete(callback);
                if (set.size === 0) listenersRef.current.delete(event);
            }
        };
    }, []);

    const value = useMemo(() => ({ subscribe, connected }), [subscribe, connected]);

    return (
        <EventContext.Provider value={value}>
            {children}
        </EventContext.Provider>
    );
};
