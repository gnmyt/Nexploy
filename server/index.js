const { Hono } = require("hono");
const { serveStatic } = require("hono/bun");
const path = require("path");
const fs = require("fs");
const db = require("./utils/database");
const packageJson = require("../package.json");
const MigrationRunner = require("./utils/migrationRunner");
const { authenticate } = require("./middlewares/auth");
const { isAdmin } = require("./middlewares/permission");
const logger = require("./utils/logger");
const { websocket } = require("./utils/websocket");
const errorHandling = require("./utils/errorHandling");
const dotenv = require("dotenv");
const { initializeTaskHandlers } = require("./tasks");
const accountRoutes = require("./routes/account");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const sessionRoutes = require("./routes/session");
const serverRoutes = require("./routes/server");
const containerRoutes = require("./routes/container");
const stackRoutes = require("./routes/stack");
const serviceRoutes = require("./routes/service");
require("./utils/folder");

process.on("uncaughtException", (err) => errorHandling(err));

const APP_PORT = process.env.SERVER_PORT || 5979;

const app = new Hono();

app.route("/api/accounts", accountRoutes);
app.route("/api/auth", authRoutes);

app.use("/api/users/*", authenticate, isAdmin);
app.route("/api/users", userRoutes);
app.use("/api/sessions/*", authenticate);
app.route("/api/sessions", sessionRoutes);
app.route("/api/servers", serverRoutes);
app.route("/api/containers", containerRoutes);
app.route("/api/stacks", stackRoutes);

app.route("/api/service", serviceRoutes);

if (process.env.NODE_ENV === "production") {
    app.use("/*", serveStatic({ root: "./dist" }));

    app.get("*", async (c) => {
        const indexPath = path.join(__dirname, "../dist", "index.html");
        const html = fs.readFileSync(indexPath, "utf-8");
        return c.html(html);
    });
} else {
    dotenv.config({ quiet: true });
    app.get("*", async (c) => {
        const html = fs.readFileSync(path.join(__dirname, "templates", "env.html"), "utf-8");
        return c.html(html, 500);
    });
}

if (!process.env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY environment variable is not set. Please set it to a random hex string.");

logger.system(`Starting Nexploy version ${packageJson.version} in ${process.env.NODE_ENV || 'development'} mode`);
logger.system(`Running on Bun ${Bun.version}`);

db.authenticate()
    .catch((err) => {
        logger.error("Could not connect to database", { error: err.message });
        process.exit(111);
    })
    .then(async () => {
        logger.system(`Successfully connected to database ${process.env.DB_TYPE === "mysql" ? "server" : "file"}`);

        const migrationRunner = new MigrationRunner();
        await migrationRunner.runMigrations();

        initializeTaskHandlers();

        Bun.serve({
            port: APP_PORT,
            fetch: app.fetch,
            websocket,
        });

        logger.system(`Server listening on port ${APP_PORT}`);
    });

process.on("SIGINT", async () => {
    logger.system("Shutting down server");

    await db.close();

    process.exit(0);
});
