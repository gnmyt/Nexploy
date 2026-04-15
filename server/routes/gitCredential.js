const { Hono } = require("hono");
const { gitCredentialCreateValidation, gitCredentialUpdateValidation } = require("../validations/gitCredential");
const {
    listGitCredentials, getGitCredential, createGitCredential,
    updateGitCredential, deleteGitCredential,
} = require("../controllers/gitCredential");
const { authenticate } = require("../middlewares/auth");
const { validateSchema } = require("../utils/schema");

const app = new Hono();

app.get("/", authenticate, async (c) => {
    return c.json(await listGitCredentials());
});

app.post("/", authenticate, async (c) => {
    const body = await c.req.json();
    const error = validateSchema(gitCredentialCreateValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await createGitCredential(body);
    if (result?.code) return c.json(result, 409);
    return c.json(result, 201);
});

app.get("/:id", authenticate, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await getGitCredential(id);
    if (result?.code) return c.json(result, 404);
    return c.json(result);
});

app.patch("/:id", authenticate, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const body = await c.req.json();
    const error = validateSchema(gitCredentialUpdateValidation, body);
    if (error) return c.json({ message: error }, 400);

    const result = await updateGitCredential(id, body);
    if (result?.code) return c.json(result, 404);
    return c.json(result);
});

app.delete("/:id", authenticate, async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const result = await deleteGitCredential(id);
    if (result?.code) return c.json(result, 404);
    return c.json(result);
});

module.exports = app;
