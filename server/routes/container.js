const { Hono } = require("hono");
const { containerActionValidation } = require("../validations/container");
const { listContainers, getContainer, refreshContainers, containerAction, removeContainer, getContainerLogs, getContainerStats } = require("../controllers/container");
const { authenticate } = require("../middlewares/auth");
const { validateSchema } = require("../utils/schema");
const { upgradeWebSocket } = require("../utils/websocket");
const Container = require("../models/Container");
const Server = require("../models/Server");
const Session = require("../models/Session");
const Account = require("../models/Account");
const { sessionManager } = require("../adapters/SessionManager");
const logger = require("../utils/logger");
const { getAccessibleResourceIds, hasContainerAccess } = require("../middlewares/projectAccess");
const { Op } = require("sequelize");

const app = new Hono();

app.get("/", authenticate, async (c) => {
    const user = c.get("user");
    const serverId = c.req.query("serverId") ? parseInt(c.req.query("serverId"), 10) : null;

    if (user.role === "admin") {
        const containers = await listContainers(serverId);
        return c.json(containers);
    }

    const containerIds = await getAccessibleResourceIds(user.id, "container");
    const serverIds = await getAccessibleResourceIds(user.id, "server");
    const where = {};
    if (serverId) where.serverId = serverId;

    const conditions = [];
    if (containerIds.length > 0) conditions.push({ id: { [Op.in]: containerIds } });
    if (serverIds.length > 0) conditions.push({ serverId: { [Op.in]: serverIds } });

    if (conditions.length === 0) return c.json([]);
    where[Op.or] = conditions;

    const containers = await Container.findAll({ where });
    return c.json(containers.map(c => {
        const raw = c.dataValues || c;
        try { raw.ports = raw.ports ? JSON.parse(raw.ports) : []; } catch { raw.ports = []; }
        try { raw.networks = raw.networks ? JSON.parse(raw.networks) : []; } catch { raw.networks = []; }
        try { raw.volumes = raw.volumes ? JSON.parse(raw.volumes) : []; } catch { raw.volumes = []; }
        return raw;
    }));
});

app.post("/refresh", authenticate, async (c) => {
    const user = c.get("user");
    const serverId = c.req.query("serverId") ? parseInt(c.req.query("serverId"), 10) : null;
    if (user.role !== "admin") {
        return c.json({ code: 403, message: "Admin access required" }, 403);
    }
    const result = await refreshContainers(serverId);
    return c.json(result);
});

app.get("/:id", authenticate, async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");

    if (user.role !== "admin") {
        const hasAccess = await hasContainerAccess(user.id, id);
        if (!hasAccess) return c.json({ code: 403, message: "Access denied" }, 403);
    }

    const container = await getContainer(id);
    if (container?.code) return c.json(container, 404);

    return c.json(container);
});

app.get("/:id/stats", authenticate, async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");

    if (user.role !== "admin") {
        const hasAccess = await hasContainerAccess(user.id, id);
        if (!hasAccess) return c.json({ code: 403, message: "Access denied" }, 403);
    }

    const stats = await getContainerStats(id);
    if (stats?.code) return c.json(stats, stats.code === 401 ? 404 : 400);

    return c.json(stats);
});

app.get("/:id/logs", authenticate, async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");

    if (user.role !== "admin") {
        const hasAccess = await hasContainerAccess(user.id, id);
        if (!hasAccess) return c.json({ code: 403, message: "Access denied" }, 403);
    }

    const tail = parseInt(c.req.query("tail"), 10) || 100;
    const timestamps = c.req.query("timestamps") === "true";
    const result = await getContainerLogs(id, tail, timestamps);
    if (result?.code) return c.json(result, result.code === 401 ? 404 : 400);

    return c.json(result);
});

app.post("/:id/action", authenticate, async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");

    if (user.role !== "admin") {
        const hasAccess = await hasContainerAccess(user.id, id, "deploy");
        if (!hasAccess) return c.json({ code: 403, message: "Access denied" }, 403);
    }

    const body = await c.req.json();
    const error = validateSchema(containerActionValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await containerAction(id, body.action);
    if (result?.code) return c.json(result, result.code === 401 ? 404 : 400);

    return c.json(result);
});

app.delete("/:id", authenticate, async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");

    if (user.role !== "admin") {
        const hasAccess = await hasContainerAccess(user.id, id, "manage");
        if (!hasAccess) return c.json({ code: 403, message: "Access denied" }, 403);
    }

    const force = c.req.query("force") === "true";
    const result = await removeContainer(id, force);
    if (result?.code) return c.json(result, result.code === 401 ? 404 : 400);

    return c.json(result);
});

app.get("/:id/logs/stream", upgradeWebSocket(async (c) => {
    const token = c.req.query("token");
    const tail = parseInt(c.req.query("tail"), 10) || 100;
    let authError = null;
    let sshSession = null;
    let containerId = null;
    let channel = null;

    try {
        if (!token) throw { code: 4401, msg: "Authentication required" };

        const session = await Session.findOne({ where: { token } });
        if (!session) throw { code: 4401, msg: "Invalid token" };

        const account = await Account.findByPk(session.accountId);
        if (!account) throw { code: 4401, msg: "Account not found" };

        const containerIdParam = c.req.param("id");

        const container = await Container.findOne({ where: { containerId: containerIdParam } });
        if (!container) throw { code: 4404, msg: "Container not found" };

        if (account.role !== "admin") {
            const access = await hasContainerAccess(account.id, containerIdParam);
            if (!access) throw { code: 4403, msg: "Access denied" };
        }

        containerId = container.containerId;

        const server = await Server.findByPk(container.serverId);
        if (!server || server.status !== "active") throw { code: 4400, msg: "Server not available" };

        sshSession = await sessionManager.getOrCreateSession(server);
    } catch (err) {
        if (err.code && err.msg) {
            authError = err;
        } else {
            authError = { code: 4500, msg: `Connection failed: ${err.message}` };
        }
    }

    return {
        onOpen(evt, ws) {
            if (authError) {
                ws.close(authError.code, authError.msg);
                return;
            }

            const sshClient = sshSession.adapter.client;
            sshClient.exec(`docker logs --follow --tail=${tail} ${containerId} 2>&1`, (err, ch) => {
                if (err) {
                    logger.error("Log stream exec failed", { containerId, error: err.message });
                    ws.close(4500, "Failed to start log stream");
                    return;
                }

                channel = ch;

                ch.on("data", (data) => {
                    try { ws.send(data.toString("utf-8")); } catch {}
                });

                ch.stderr.on("data", (data) => {
                    try { ws.send(data.toString("utf-8")); } catch {}
                });

                ch.on("close", () => {
                    try { ws.close(1000, "Log stream ended"); } catch {}
                });
            });
        },
        onMessage() {},
        onClose() {
            if (channel) channel.close();
        },
    };
}));

app.get("/:id/terminal", upgradeWebSocket(async (c) => {
    const token = c.req.query("token");
    let authError = null;
    let sshSession = null;
    let containerId = null;
    let channel = null;

    try {
        if (!token) throw { code: 4401, msg: "Authentication required" };

        const session = await Session.findOne({ where: { token } });
        if (!session) throw { code: 4401, msg: "Invalid token" };

        const account = await Account.findByPk(session.accountId);
        if (!account) throw { code: 4401, msg: "Account not found" };

        const containerIdParam = c.req.param("id");

        const container = await Container.findOne({ where: { containerId: containerIdParam } });
        if (!container) throw { code: 4404, msg: "Container not found" };

        if (account.role !== "admin") {
            const access = await hasContainerAccess(account.id, containerIdParam, "deploy");
            if (!access) throw { code: 4403, msg: "Access denied" };
        }

        containerId = container.containerId;

        const server = await Server.findByPk(container.serverId);
        if (!server || server.status !== "active") throw { code: 4400, msg: "Server not available" };

        sshSession = await sessionManager.getOrCreateSession(server);
    } catch (err) {
        if (err.code && err.msg) {
            authError = err;
        } else {
            authError = { code: 4500, msg: `Connection failed: ${err.message}` };
        }
    }

    return {
        onOpen(evt, ws) {
            if (authError) {
                ws.close(authError.code, authError.msg);
                return;
            }

            const sshClient = sshSession.adapter.client;
            sshClient.exec(`docker exec -it ${containerId} sh`, { pty: true }, (err, ch) => {
                if (err) {
                    logger.error("Terminal exec failed", { containerId, error: err.message });
                    ws.close(4500, "Failed to start terminal");
                    return;
                }

                channel = ch;

                ch.on("data", (data) => {
                    try { ws.send(data.toString("utf-8")); } catch {}
                });

                ch.stderr.on("data", (data) => {
                    try { ws.send(data.toString("utf-8")); } catch {}
                });

                ch.on("close", () => {
                    try { ws.close(1000, "Terminal closed"); } catch {}
                });
            });
        },
        onMessage(evt, ws) {
            if (!channel) return;
            const msg = typeof evt.data === "string" ? evt.data : evt.data.toString();
            try {
                const parsed = JSON.parse(msg);
                if (parsed.type === "input") {
                    channel.write(parsed.data);
                } else if (parsed.type === "resize" && parsed.cols && parsed.rows) {
                    channel.setWindow(parsed.rows, parsed.cols, 0, 0);
                }
            } catch {
                channel.write(msg);
            }
        },
        onClose() {
            if (channel) channel.close();
        },
    };
}));

module.exports = app;
