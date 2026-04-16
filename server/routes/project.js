const { Hono } = require("hono");
const {
    listProjects, getProject, createProject, updateProject, deleteProject,
    listMembers, addMember, updateMember, removeMember,
    listResources, addResource, removeResource,
} = require("../controllers/project");
const { authenticate } = require("../middlewares/auth");
const { isAdmin } = require("../middlewares/permission");
const { validateSchema } = require("../utils/schema");
const {
    projectCreateValidation, projectUpdateValidation,
    projectMemberValidation, projectResourceValidation,
} = require("../validations/project");

const app = new Hono();

app.get("/", authenticate, async (c) => {
    const user = c.get("user");
    return c.json(await listProjects(user));
});

app.post("/", authenticate, isAdmin, async (c) => {
    const body = await c.req.json();
    const error = validateSchema(projectCreateValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await createProject(body);
    if (result?.code) return c.json(result, 409);
    return c.json(result, 201);
});

app.get("/:id", authenticate, async (c) => {
    const user = c.get("user");
    const id = parseInt(c.req.param("id"), 10);

    const project = await getProject(id);
    if (project?.code) return c.json(project, 404);

    if (user.role !== "admin") {
        const members = await listMembers(id);
        if (Array.isArray(members) && !members.some(m => m.accountId === user.id)) {
            return c.json({ code: 403, message: "Access denied" }, 403);
        }
    }

    return c.json(project);
});

app.patch("/:id", authenticate, isAdmin, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json();
    const error = validateSchema(projectUpdateValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await updateProject(id, body);
    if (result?.code) return c.json(result, result.code === 901 ? 404 : 409);
    return c.json(result);
});

app.delete("/:id", authenticate, isAdmin, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await deleteProject(id);
    if (result?.code) return c.json(result, 404);
    return c.json({ message: "Project deleted" });
});

app.get("/:id/members", authenticate, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await listMembers(id);
    if (result?.code) return c.json(result, 404);
    return c.json(result);
});

app.post("/:id/members", authenticate, isAdmin, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json();
    const error = validateSchema(projectMemberValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await addMember(id, body.accountId, body.permission);
    if (result?.code) return c.json(result, result.code === 901 ? 404 : 409);
    return c.json(result, 201);
});

app.patch("/:id/members/:memberId", authenticate, isAdmin, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const memberId = parseInt(c.req.param("memberId"), 10);
    const body = await c.req.json();

    if (!body.permission || !["view", "deploy", "manage"].includes(body.permission)) {
        return c.json({ message: "Invalid permission level" }, 400);
    }

    const result = await updateMember(id, memberId, body.permission);
    if (result?.code) return c.json(result, 404);
    return c.json(result);
});

app.delete("/:id/members/:memberId", authenticate, isAdmin, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const memberId = parseInt(c.req.param("memberId"), 10);

    const result = await removeMember(id, memberId);
    if (result?.code) return c.json(result, 404);
    return c.json({ message: "Member removed" });
});

app.get("/:id/resources", authenticate, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await listResources(id);
    if (result?.code) return c.json(result, 404);
    return c.json(result);
});

app.post("/:id/resources", authenticate, isAdmin, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json();
    const error = validateSchema(projectResourceValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await addResource(id, body.resourceType, body.resourceId);
    if (result?.code) return c.json(result, result.code === 901 ? 404 : 409);
    return c.json(result, 201);
});

app.delete("/:id/resources/:resourceId", authenticate, isAdmin, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const resourceId = parseInt(c.req.param("resourceId"), 10);

    const result = await removeResource(id, resourceId);
    if (result?.code) return c.json(result, 404);
    return c.json({ message: "Resource removed" });
});

module.exports = app;
