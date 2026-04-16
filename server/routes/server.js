const { Hono } = require("hono");
const { createServerValidation, updateServerValidation, executeCommandValidation } = require("../validations/server");
const { createServer, listServers, getServer, updateServer, deleteServer, reprovisionServer, testConnection, getServerLogs, executeCommand } = require("../controllers/server");
const { authenticate } = require("../middlewares/auth");
const { isAdmin } = require("../middlewares/permission");
const { validateSchema } = require("../utils/schema");
const { sendError } = require("../utils/error");
const { getAccessibleResourceIds, requireResourceAccess } = require("../middlewares/projectAccess");
const { Op } = require("sequelize");
const Server = require("../models/Server");

const app = new Hono();

app.get("/", authenticate, async (c) => {
    const user = c.get("user");
    if (user.role === "admin") {
        return c.json(await listServers());
    }
    const accessibleIds = await getAccessibleResourceIds(user.id, "server");
    if (accessibleIds.length === 0) return c.json([]);
    const servers = await Server.findAll({ where: { id: { [Op.in]: accessibleIds } } });
    return c.json(servers);
});

app.get("/:id", authenticate, requireResourceAccess("server", "id", "view"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return sendError(c, 400, 300, "Invalid server ID");

    const server = await getServer(id);
    if (server?.code) return c.json(server, 404);

    return c.json(server);
});

app.post("/", authenticate, isAdmin, async (c) => {
    const body = await c.req.json();
    const error = validateSchema(createServerValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await createServer(body);
    if (result?.code) return c.json(result, 400);

    return c.json(result);
});

app.patch("/:id", authenticate, requireResourceAccess("server", "id", "manage"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return sendError(c, 400, 300, "Invalid server ID");

    const body = await c.req.json();
    const error = validateSchema(updateServerValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await updateServer(id, body);
    if (result?.code) return c.json(result, 404);

    return c.json(result);
});

app.delete("/:id", authenticate, isAdmin, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return sendError(c, 400, 300, "Invalid server ID");

    const result = await deleteServer(id);
    if (result?.code) return c.json(result, 404);

    return c.json(result);
});

app.post("/:id/reprovision", authenticate, requireResourceAccess("server", "id", "manage"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return sendError(c, 400, 300, "Invalid server ID");

    const result = await reprovisionServer(id);
    if (result?.code >= 300) return c.json(result, result.code === 302 ? 404 : 400);

    return c.json(result);
});

app.post("/:id/test", authenticate, requireResourceAccess("server", "id", "view"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return sendError(c, 400, 300, "Invalid server ID");

    const result = await testConnection(id);
    if (result?.code) return c.json(result, result.code === 302 ? 404 : 400);

    return c.json(result);
});

app.get("/:id/logs", authenticate, requireResourceAccess("server", "id", "view"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return sendError(c, 400, 300, "Invalid server ID");

    const limit = parseInt(c.req.query("limit"), 10) || 100;
    const result = await getServerLogs(id, limit);

    return c.json(result);
});

app.post("/:id/exec", authenticate, requireResourceAccess("server", "id", "manage"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return sendError(c, 400, 300, "Invalid server ID");

    const body = await c.req.json();
    const error = validateSchema(executeCommandValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await executeCommand(id, body.command);
    if (result?.code >= 300) return c.json(result, result.code === 302 ? 404 : 400);

    return c.json(result);
});

module.exports = app;
