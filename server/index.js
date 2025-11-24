const express = require("express");
const path = require("path");
const db = require("./utils/database");
const packageJson = require("../package.json");
const MigrationRunner = require("./utils/migrationRunner");
const { authenticate } = require("./middlewares/auth");
const expressWs = require("express-ws");
const { generateOpenAPISpec } = require("./openapi");
const { isAdmin } = require("./middlewares/permission");
const logger = require("./utils/logger");
require("./utils/folder");

process.on("uncaughtException", (err) => require("./utils/errorHandling")(err));

const APP_PORT = process.env.SERVER_PORT || 5979;

const app = expressWs(express()).app;

generateOpenAPISpec(app);

app.disable("x-powered-by");
app.use(express.json());

app.use("/api/accounts", require("./routes/account"));
app.use("/api/auth", require("./routes/auth"));

app.use("/api/users", authenticate, isAdmin, require("./routes/users"));
app.use("/api/sessions", authenticate, require("./routes/session"));

app.use("/api/service", require("./routes/service"));

if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(__dirname, "../dist")));

    app.get("*name", (req, res) =>
        res.sendFile(path.join(__dirname, "../dist", "index.html"))
    );
} else {
    require("dotenv").config({ quiet: true });
    app.get("*name", (req, res) =>
        res.status(500).sendFile(path.join(__dirname, "templates", "env.html"))
    );
}

if (!process.env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY environment variable is not set. Please set it to a random hex string.");

logger.system(`Starting Nexploy version ${packageJson.version} in ${process.env.NODE_ENV || 'development'} mode`);
logger.system(`Running on Node.js ${process.version}`);

db.authenticate()
    .catch((err) => {
        logger.error("Could not connect to database", { error: err.message });
        process.exit(111);
    })
    .then(async () => {
        logger.system(`Successfully connected to database ${process.env.DB_TYPE === "mysql" ? "server" : "file"}`);

        const migrationRunner = new MigrationRunner();
        await migrationRunner.runMigrations();

        app.listen(APP_PORT, () =>
            logger.system(`Server listening on port ${APP_PORT}`)
        );
    });

process.on("SIGINT", async () => {
    logger.system("Shutting down server");

    await db.close();

    process.exit(0);
});
