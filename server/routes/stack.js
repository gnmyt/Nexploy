const { Hono } = require("hono");
const { stackActionValidation, stackComposeValidation, stackCreateValidation } = require("../validations/stack");
const { listStacks, getStack, refreshStacks, stackAction, getStackCompose, updateStackCompose, createStack, deleteStack, getStackLogs } = require("../controllers/stack");
const { authenticate } = require("../middlewares/auth");
const { validateSchema } = require("../utils/schema");
const { upgradeWebSocket } = require("../utils/websocket");
const Stack = require("../models/Stack");
const Server = require("../models/Server");
const Session = require("../models/Session");
const Account = require("../models/Account");
const { sessionManager } = require("../adapters/SessionManager");
const logger = require("../utils/logger");

const app = new Hono();

app.get("/", authenticate, async (c) => {
    const serverId = c.req.query("serverId") ? parseInt(c.req.query("serverId"), 10) : null;
    return c.json(await listStacks(serverId));
});

app.post("/refresh", authenticate, async (c) => {
    const serverId = c.req.query("serverId") ? parseInt(c.req.query("serverId"), 10) : null;
    return c.json(await refreshStacks(serverId));
});

app.post("/", authenticate, async (c) => {
    const body = await c.req.json();
    const error = validateSchema(stackCreateValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await createStack(body.serverId, body.name, body.composeContent);
    if (result?.code) return c.json(result, result.code === 502 ? 400 : 409);
    return c.json(result, 201);
});

app.get("/:id", authenticate, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const stack = await getStack(id);
    if (stack?.code) return c.json(stack, 404);
    return c.json(stack);
});

app.get("/:id/compose", authenticate, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await getStackCompose(id);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.put("/:id/compose", authenticate, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json();
    const error = validateSchema(stackComposeValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await updateStackCompose(id, body.content);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.post("/:id/action", authenticate, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json();
    const error = validateSchema(stackActionValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await stackAction(id, body.action);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.delete("/:id", authenticate, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await deleteStack(id);
    if (result?.code) return c.json(result, result.code === 501 ? 404 : 400);
    return c.json(result);
});

app.get("/:id/logs", authenticate, async (c) => {
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
        if (!await Account.findByPk(session.accountId)) throw { code: 4401, msg: "Account not found" };

        const stackId = parseInt(c.req.param("id"), 10);
        stack = await Stack.findByPk(stackId);
        if (!stack) throw { code: 4404, msg: "Stack not found" };

        const server = await Server.findByPk(stack.serverId);
        if (!server || server.status !== "active") throw { code: 4400, msg: "Server not available" };

        sshSession = await sessionManager.getOrCreateSession(server);
    } catch (err) {
        authError = err.code && err.msg ? err : { code: 4500, msg: `Connection failed: ${err.message}` };
    }

    return {
        onOpen(evt, ws) {
            if (authError) {
                ws.close(authError.code, authError.msg);
                return;
            }

            const cmd = `cd ${escapeShellArg(stack.directory)} && docker compose -f ${escapeShellArg(stack.configFile)} logs --follow --tail=${tail} 2>&1`;
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
