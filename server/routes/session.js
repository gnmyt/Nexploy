const { Hono } = require("hono");
const { listSessions, destroySession } = require("../controllers/session");

const app = new Hono();

app.get("/list", async (c) => {
    return c.json(await listSessions(c.get("user").id, c.get("session").id));
});

app.delete("/:id", async (c) => {
    return c.json(await destroySession(c.get("user").id, c.req.param("id")));
});

module.exports = app;