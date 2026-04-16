const { Hono } = require("hono");
const { deploymentCreateValidation, deploymentUpdateValidation } = require("../validations/deployment");
const {
    listDeployments, getDeployment, createDeployment, updateDeployment,
    deleteDeployment, buildDeployment, getBuildLog, checkForUpdates,
} = require("../controllers/deployment");
const { authenticate } = require("../middlewares/auth");
const { isAdmin } = require("../middlewares/permission");
const { validateSchema } = require("../utils/schema");
const { getAccessibleResourceIds, requireResourceAccess } = require("../middlewares/projectAccess");
const { Op } = require("sequelize");
const Deployment = require("../models/Deployment");

const app = new Hono();

app.get("/", authenticate, async (c) => {
    const user = c.get("user");
    const serverId = c.req.query("serverId") ? parseInt(c.req.query("serverId"), 10) : null;

    if (user.role === "admin") {
        return c.json(await listDeployments(serverId));
    }

    const deploymentIds = await getAccessibleResourceIds(user.id, "deployment");
    const serverIds = await getAccessibleResourceIds(user.id, "server");
    const where = {};
    if (serverId) where.serverId = serverId;

    const conditions = [];
    if (deploymentIds.length > 0) conditions.push({ id: { [Op.in]: deploymentIds } });
    if (serverIds.length > 0) conditions.push({ serverId: { [Op.in]: serverIds } });

    if (conditions.length === 0) return c.json([]);
    where[Op.or] = conditions;

    const deployments = await Deployment.findAll({ where });
    return c.json(deployments);
});

app.post("/", authenticate, isAdmin, async (c) => {
    const body = await c.req.json();
    const error = validateSchema(deploymentCreateValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await createDeployment(body);
    if (result?.code) return c.json(result, result.code === 602 ? 400 : 409);
    return c.json(result, 201);
});

app.get("/:id", authenticate, requireResourceAccess("deployment", "id", "view"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await getDeployment(id);
    if (result?.code) return c.json(result, 404);
    return c.json(result);
});

app.patch("/:id", authenticate, requireResourceAccess("deployment", "id", "manage"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json();
    const error = validateSchema(deploymentUpdateValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await updateDeployment(id, body);
    if (result?.code) return c.json(result, 404);
    return c.json(result);
});

app.delete("/:id", authenticate, requireResourceAccess("deployment", "id", "manage"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await deleteDeployment(id);
    if (result?.code) return c.json(result, result.code === 601 ? 404 : 400);
    return c.json(result);
});

app.post("/:id/build", authenticate, requireResourceAccess("deployment", "id", "deploy"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await buildDeployment(id);
    if (result?.code) return c.json(result, result.code === 601 ? 404 : 400);
    return c.json(result);
});

app.get("/:id/log", authenticate, requireResourceAccess("deployment", "id", "view"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await getBuildLog(id);
    if (result?.code) return c.json(result, 404);
    return c.json(result);
});

app.get("/:id/updates", authenticate, requireResourceAccess("deployment", "id", "view"), async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await checkForUpdates(id);
    if (result?.code) return c.json(result, result.code === 601 ? 404 : 400);
    return c.json(result);
});

module.exports = app;
