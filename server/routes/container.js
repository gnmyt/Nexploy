const { Hono } = require("hono");
const { containerActionValidation } = require("../validations/container");
const { listContainers, getContainer, refreshContainers, containerAction, removeContainer, getContainerLogs, getContainerStats } = require("../controllers/container");
const { authenticate } = require("../middlewares/auth");
const { validateSchema } = require("../utils/schema");
const { sendError } = require("../utils/error");
const { upgradeWebSocket } = require("../utils/websocket");
const Container = require("../models/Container");
const Server = require("../models/Server");
const Session = require("../models/Session");
const Account = require("../models/Account");
const { sessionManager } = require("../adapters/SessionManager");
const logger = require("../utils/logger");

const app = new Hono();

app.get("/", authenticate, async (c) => {
    const serverId = c.req.query("serverId") ? parseInt(c.req.query("serverId"), 10) : null;
    const containers = await listContainers(serverId);
    return c.json(containers);
});

app.post("/refresh", authenticate, async (c) => {
    const serverId = c.req.query("serverId") ? parseInt(c.req.query("serverId"), 10) : null;
    const result = await refreshContainers(serverId);
    return c.json(result);
});

app.get("/:id", authenticate, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return sendError(c, 400, 400, "Invalid container ID");

    const container = await getContainer(id);
    if (container?.code) return c.json(container, 404);

    return c.json(container);
});

app.get("/:id/stats", authenticate, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return sendError(c, 400, 400, "Invalid container ID");

    const stats = await getContainerStats(id);
    if (stats?.code) return c.json(stats, stats.code === 401 ? 404 : 400);

    return c.json(stats);
});

app.get("/:id/logs", authenticate, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return sendError(c, 400, 400, "Invalid container ID");

    const tail = parseInt(c.req.query("tail"), 10) || 100;
    const result = await getContainerLogs(id, tail);
    if (result?.code) return c.json(result, result.code === 401 ? 404 : 400);

    return c.json(result);
});

app.post("/:id/action", authenticate, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return sendError(c, 400, 400, "Invalid container ID");

    const body = await c.req.json();
    const error = validateSchema(containerActionValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await containerAction(id, body.action);
    if (result?.code) return c.json(result, result.code === 401 ? 404 : 400);

    return c.json(result);
});

app.delete("/:id", authenticate, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return sendError(c, 400, 400, "Invalid container ID");

    const force = c.req.query("force") === "true";
    const result = await removeContainer(id, force);
    if (result?.code) return c.json(result, result.code === 401 ? 404 : 400);

    return c.json(result);
});

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

        if (!await Account.findByPk(session.accountId)) throw { code: 4401, msg: "Account not found" };

        const id = parseInt(c.req.param("id"), 10);
        if (isNaN(id)) throw { code: 4400, msg: "Invalid container ID" };

        const container = await Container.findByPk(id);
        if (!container) throw { code: 4404, msg: "Container not found" };

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
