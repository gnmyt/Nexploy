const { Hono } = require("hono");
const { getFTSStatus } = require("../controllers/account");

const app = new Hono();

app.get("/is-fts", async (c) => {
    try {
        const status = await getFTSStatus();
        return c.json(status);
    } catch (err) {
        return c.json({ error: err.message }, 500);
    }
});

module.exports = app;