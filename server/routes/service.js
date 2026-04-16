const { Hono } = require("hono");
const { streamSSE } = require("hono/streaming");
const { getFTSStatus } = require("../controllers/account");
const Session = require("../models/Session");
const Account = require("../models/Account");
const eventBus = require("../utils/eventBus");

const app = new Hono();

app.get("/events", async (c) => {
    const token = c.req.query("token");
    if (!token) return c.json({ message: "Token required" }, 401);

    const session = await Session.findOne({ where: { token } });
    if (!session) return c.json({ message: "Invalid token" }, 401);

    const user = await Account.findByPk(session.accountId);
    if (!user) return c.json({ message: "Account not found" }, 401);

    return streamSSE(c, async (stream) => {
        const writer = {
            writeSSE(msg) {
                return stream.writeSSE(msg);
            },
        };

        eventBus.addClient(writer);
        await stream.writeSSE({ event: "connected", data: "{}" });

        const keepalive = setInterval(() => {
            try { stream.writeSSE({ event: "keepalive", data: "{}" }); } catch { clearInterval(keepalive); }
        }, 30000);

        stream.onAbort(() => {
            clearInterval(keepalive);
            eventBus.removeClient(writer);
        });

        await new Promise(() => {});
    });
});

app.get("/is-fts", async (c) => {
    try {
        const status = await getFTSStatus();
        return c.json(status);
    } catch (err) {
        return c.json({ error: err.message }, 500);
    }
});

module.exports = app;