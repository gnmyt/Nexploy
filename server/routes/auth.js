const { Hono } = require("hono");
const { login, logout } = require("../controllers/auth");
const { loginValidation, tokenValidation } = require("../validations/auth");
const { validateSchema } = require("../utils/schema");

const app = new Hono();

app.post("/login", async (c) => {
    const body = await c.req.json();
    const error = validateSchema(loginValidation, body);
    if (error) return c.json({ message: error }, 400);

    const ip = c.req.header("x-forwarded-for") || "unknown";
    const session = await login(body, {
        ip,
        userAgent: c.req.header("User-Agent") || "None",
    });
    if (session?.code) return c.json(session);

    c.header("Authorization", session?.token);
    return c.json({ ...session, message: "Your session got successfully created" });
});

app.post("/logout", async (c) => {
    const body = await c.req.json();
    const error = validateSchema(tokenValidation, body);
    if (error) return c.json({ message: error }, 400);

    const session = await logout(body.token);
    if (session) return c.json(session);

    return c.json({ message: "Your session got deleted successfully" });
});

module.exports = app;
