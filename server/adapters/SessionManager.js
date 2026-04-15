const { createAdapter } = require("./index");
const logger = require("../utils/logger");

class ServerSession {
    constructor(serverId, server) {
        this.id = `${serverId}-${Date.now()}`;
        this.serverId = serverId;
        this.server = server;
        this.adapter = null;
        this.logs = [];
        this.maxLogs = 10000;
        this.listeners = new Set();
        this.createdAt = new Date();
        this.lastActivity = new Date();
    }

    connect = async () => {
        this.adapter = createAdapter(this.server, this);
        if (!this.adapter) throw new Error(`No adapter found for server type: ${this.server.type}`);
        await this.adapter.connect();
        this.lastActivity = new Date();
    };

    disconnect = async () => {
        if (this.adapter) {
            await this.adapter.disconnect();
            this.adapter = null;
        }
    };

    exec = async (command, options = {}) => {
        if (!this.adapter || !this.adapter.connected) throw new Error("Session is not connected");
        this.lastActivity = new Date();
        return this.adapter.exec(command, options);
    };

    addLog = (type, message) => {
        const entry = { type, message, timestamp: new Date().toISOString() };
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) this.logs = this.logs.slice(-this.maxLogs);
        this.notifyListeners(entry);
    };

    subscribe = (callback) => {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    };

    notifyListeners = (entry) => {
        for (const callback of this.listeners) {
            try { callback(entry); } catch (err) {
                logger.error("Error in session listener", { error: err.message });
            }
        }
    };

    getLogs = (limit = 100) => this.logs.slice(-limit);

    isConnected = () => this.adapter?.connected ?? false;
}

class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), 5 * 60 * 1000);
        this.maxIdleTime = 30 * 60 * 1000;
    }

    getOrCreateSession = async (server) => {
        let session = this.sessions.get(server.id);

        if (session && session.isConnected()) {
            session.lastActivity = new Date();
            return session;
        }

        if (session) await this.closeSession(server.id);

        session = new ServerSession(server.id, server);
        this.sessions.set(server.id, session);
        await session.connect();

        logger.info(`Session created for server ${server.id}`, { serverId: server.id, host: server.host });
        return session;
    };

    getSession = (serverId) => this.sessions.get(serverId) || null;

    closeSession = async (serverId) => {
        const session = this.sessions.get(serverId);
        if (session) {
            try { await session.disconnect(); } catch (err) {
                logger.error(`Error closing session for server ${serverId}`, { error: err.message });
            }
            this.sessions.delete(serverId);
            logger.info(`Session closed for server ${serverId}`);
        }
    };

    cleanupStaleSessions = async () => {
        const now = Date.now();
        for (const [serverId, session] of this.sessions) {
            const idleTime = now - session.lastActivity.getTime();
            if (idleTime > this.maxIdleTime) {
                logger.info(`Cleaning up stale session for server ${serverId}`, { idleTime });
                await this.closeSession(serverId);
            }
        }
    };

    closeAllSessions = async () => {
        clearInterval(this.cleanupInterval);
        await Promise.all([...this.sessions.keys()].map((id) => this.closeSession(id)));
        logger.info("All server sessions closed");
    };

    getActiveSessionCount = () => this.sessions.size;
}

const sessionManager = new SessionManager();

module.exports = { ServerSession, SessionManager, sessionManager };
