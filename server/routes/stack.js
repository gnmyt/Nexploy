const { Hono } = require("hono");
const { stackActionValidation, stackComposeValidation, stackCreateValidation, stackEnvValidation, stackConfigFileValidation, stackSqliteQueryValidation } = require("../validations/stack");
const { listStacks, getStack, refreshStacks, stackAction, getStackCompose, updateStackCompose, createStack, deleteStack, getStackLogs, getStackContainers, getStackEnv, updateStackEnv, getStackConfigFiles, getStackConfigFile, updateStackConfigFile, getSqliteTables, getSqliteTableData, executeSqliteQuery } = require("../controllers/stack");
const { authenticate } = require("../middlewares/auth");
const { isAdmin } = require("../middlewares/permission");
const { validateSchema } = require("../utils/schema");
const { upgradeWebSocket } = require("../utils/websocket");
const Stack = require("../models/Stack");
const Server = require("../models/Server");
const Session = require("../models/Session");
const Account = require("../models/Account");
const { sessionManager } = require("../adapters/SessionManager");
const logger = require("../utils/logger");
const { getDockerComposeCmd } = require("../utils/dockerCompose");
const { getAccessibleResourceIds, requireResourceAccess, hasResourceAccess } = require("../middlewares/projectAccess");
const { Op } = require("sequelize");

const app = new Hono();

app.get("/", authenticate, async (c) => {
    const user = c.get("user");
    const serverId = c.req.query("serverId") ? parseInt(c.req.query("serverId"), 10) : null;

    if (user.role === "admin") {
        return c.json(await listStacks(serverId));
    }

    const stackIds = await getAccessibleResourceIds(user.id, "stack");
    const serverIds = await getAccessibleResourceIds(user.id, "server");
    const where = {};
    if (serverId) where.serverId = serverId;

    const allAccessibleIds = [...new Set(stackIds)];
    if (serverIds.length > 0) {
        const serverStacks = await Stack.findAll({
            where: { serverId: { [Op.in]: serverIds } },
            attributes: ["id"],
        });
        serverStacks.forEach(s => allAccessibleIds.push(s.id));
    }

    if (allAccessibleIds.length === 0) return c.json([]);
    where.id = { [Op.in]: [...new Set(allAccessibleIds)] };

    const stacks = await Stack.findAll({ where });
    return c.json(stacks);
});

app.post("/refresh", authenticate, async (c) => {
    const user = c.get("user");
    const serverId = c.req.query("serverId") ? parseInt(c.req.query("serverId"), 10) : null;

    if (user.role !== "admin" && serverId) {
        const hasAccess = await hasResourceAccess(user.id, "server", serverId, "deploy");
        if (!hasAccess) return c.json({ code: 403, message: "Access denied" }, 403);
    } else if (user.role !== "admin") {
        return c.json({ code: 403, message: "Admin access required to refresh all stacks" }, 403);
    }
    return c.json(await refreshStacks(serverId));
});

app.post("/", authenticate, isAdmin, async (c) => {
    const body = await c.req.json();
    const error = validateSchema(stackCreateValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await createStack(body.serverId, body.name, body.composeContent);
    if (result?.code) return c.json(result, result.code === 502 ? 400 : 409);
    return c.json(result, 201);
});

app.get("/:id", authenticate, requireResourceAccess("stack", "id", "view"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const stack = await getStack(id);
    if (stack?.code) return c.json(stack, 404);
    return c.json(stack);
});

app.get("/:id/compose", authenticate, requireResourceAccess("stack", "id", "view"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await getStackCompose(id);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.put("/:id/compose", authenticate, requireResourceAccess("stack", "id", "manage"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json();
    const error = validateSchema(stackComposeValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await updateStackCompose(id, body.content);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.post("/:id/action", authenticate, requireResourceAccess("stack", "id", "deploy"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json();
    const error = validateSchema(stackActionValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await stackAction(id, body.action);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.delete("/:id", authenticate, requireResourceAccess("stack", "id", "manage"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await deleteStack(id);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.get("/:id/containers", authenticate, requireResourceAccess("stack", "id", "view"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await getStackContainers(id);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.get("/:id/env", authenticate, requireResourceAccess("stack", "id", "view"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await getStackEnv(id);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.put("/:id/env", authenticate, requireResourceAccess("stack", "id", "manage"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json();
    const error = validateSchema(stackEnvValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await updateStackEnv(id, body.variables);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.get("/:id/config-files", authenticate, requireResourceAccess("stack", "id", "view"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await getStackConfigFiles(id);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.get("/:id/config-file", authenticate, requireResourceAccess("stack", "id", "view"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const filePath = c.req.query("path");
    if (!filePath) return c.json({ message: "path query parameter required" }, 400);
    const result = await getStackConfigFile(id, filePath);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.put("/:id/config-file", authenticate, requireResourceAccess("stack", "id", "manage"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json();
    const error = validateSchema(stackConfigFileValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await updateStackConfigFile(id, body.path, body.content);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.get("/:id/sqlite/tables", authenticate, requireResourceAccess("stack", "id", "view"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const filePath = c.req.query("path");
    if (!filePath) return c.json({ message: "path query parameter required" }, 400);
    const result = await getSqliteTables(id, filePath);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.get("/:id/sqlite/table", authenticate, requireResourceAccess("stack", "id", "view"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const filePath = c.req.query("path");
    const table = c.req.query("table");
    const page = parseInt(c.req.query("page"), 10) || 1;
    const pageSize = Math.min(parseInt(c.req.query("pageSize"), 10) || 50, 200);
    if (!filePath || !table) return c.json({ message: "path and table query parameters required" }, 400);
    const result = await getSqliteTableData(id, filePath, table, page, pageSize);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.post("/:id/sqlite/query", authenticate, requireResourceAccess("stack", "id", "manage"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json();
    const error = validateSchema(stackSqliteQueryValidation, body);
    if (error) return c.json({ message: error }, 400);
    const result = await executeSqliteQuery(id, body.path, body.query);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.get("/:id/logs", authenticate, requireResourceAccess("stack", "id", "view"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const tail = parseInt(c.req.query("tail"), 10) || 100;
    const timestamps = c.req.query("timestamps") === "true";
    const result = await getStackLogs(id, tail, timestamps);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

const escapeShellArg = (arg) => `'${arg.replace(/'/g, "'\\''")}'`;

app.get("/:id/logs/stream", upgradeWebSocket(async (c) => {
    const token = c.req.query("token");
    const tail = parseInt(c.req.query("tail"), 10) || 100;
    let authError = null;
    let sshSession = null;
    let stack = null;
    let channel = null;

    try {
        if (!token) throw { code: 4401, msg: "Authentication required" };

        const session = await Session.findOne({ where: { token } });
        if (!session) throw { code: 4401, msg: "Invalid token" };
        const account = await Account.findByPk(session.accountId);
        if (!account) throw { code: 4401, msg: "Account not found" };

        const stackId = parseInt(c.req.param("id"), 10);
        stack = await Stack.findByPk(stackId);
        if (!stack) throw { code: 4404, msg: "Stack not found" };

        if (account.role !== "admin") {
            const hasAccess = await hasResourceAccess(account.id, "stack", stackId) ||
                await hasResourceAccess(account.id, "server", stack.serverId);
            if (!hasAccess) throw { code: 4403, msg: "Access denied" };
        }

        const server = await Server.findByPk(stack.serverId);
        if (!server || server.status !== "active") throw { code: 4400, msg: "Server not available" };

        sshSession = await sessionManager.getOrCreateSession(server);
    } catch (err) {
        authError = err.code && err.msg ? err : { code: 4500, msg: `Connection failed: ${err.message}` };
    }

    let composeExe = "docker compose";
    if (sshSession) {
        try { composeExe = await getDockerComposeCmd(sshSession); } catch {}
    }

    return {
        onOpen(evt, ws) {
            if (authError) {
                ws.close(authError.code, authError.msg);
                return;
            }

            const cmd = `cd ${escapeShellArg(stack.directory)} && ${composeExe} -f ${escapeShellArg(stack.configFile)} logs --follow --tail=${tail} 2>&1`;
            const sshClient = sshSession.adapter.client;

            sshClient.exec(cmd, (err, ch) => {
                if (err) {
                    logger.error("Stack log stream exec failed", { stackId: stack.id, error: err.message });
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

module.exports = app;
