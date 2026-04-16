const { Hono } = require("hono");
const { authenticate } = require("../middlewares/auth");
const { listApps, getApp, getAppLogo, getAppGalleryImage } = require("../controllers/source");
const {
    installApp, updateApp, uninstallApp, listInstalledApps,
    getInstalledAppDetails, updateInstalledAppConfig, executeInstalledAppHook,
    getAppPortAnalysis,
} = require("../controllers/appInstall");
const { appInstallValidation } = require("../validations/appInstall");
const { validateSchema } = require("../utils/schema");
const path = require("path");

const app = new Hono();

app.get("/:source/:slug/logo", async (c) => {
    const { source, slug } = c.req.param();
    const logoPath = getAppLogo(source, slug);
    if (!logoPath) return c.json({ code: 404, message: "Logo not found" }, 404);

    const file = Bun.file(logoPath);
    return new Response(file, {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
    });
});

app.get("/:source/:slug/gallery/:filename", async (c) => {
    const { source, slug, filename } = c.req.param();
    const imagePath = getAppGalleryImage(source, slug, filename);
    if (!imagePath) return c.json({ code: 404, message: "Image not found" }, 404);

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    const file = Bun.file(imagePath);
    return new Response(file, {
        headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
    });
});

app.get("/", authenticate, async (c) => {
    try {
        const { page, limit, search, category, type, source } = c.req.query();
        const result = await listApps({
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 24,
            search,
            category,
            type,
            source,
        });
        return c.json(result);
    } catch (err) {
        return c.json({ code: 500, message: err.message }, 500);
    }
});

app.get("/installed", authenticate, async (c) => {
    try {
        const result = await listInstalledApps();
        return c.json(result);
    } catch (err) {
        return c.json({ code: 500, message: err.message }, 500);
    }
});

app.post("/installed/:id/update", authenticate, async (c) => {
    try {
        const id = parseInt(c.req.param("id"), 10);
        const result = await updateApp(id);
        if (result?.code) {
            const status = result.code === 404 ? 404 : result.code === 400 ? 400 : 500;
            return c.json(result, status);
        }
        return c.json(result);
    } catch (err) {
        return c.json({ code: 500, message: err.message }, 500);
    }
});

app.get("/installed/:id", authenticate, async (c) => {
    try {
        const id = parseInt(c.req.param("id"), 10);
        const result = await getInstalledAppDetails(id);
        if (result?.code) return c.json(result, result.code === 404 ? 404 : 500);
        return c.json(result);
    } catch (err) {
        return c.json({ code: 500, message: err.message }, 500);
    }
});

app.patch("/installed/:id/config", authenticate, async (c) => {
    try {
        const id = parseInt(c.req.param("id"), 10);
        const body = await c.req.json();
        if (!body.config || typeof body.config !== "object") {
            return c.json({ message: "config object is required" }, 400);
        }
        const result = await updateInstalledAppConfig(id, body.config);
        if (result?.code) return c.json(result, result.code === 404 ? 404 : 500);
        return c.json(result);
    } catch (err) {
        return c.json({ code: 500, message: err.message }, 500);
    }
});

app.post("/installed/:id/hooks/:hookName", authenticate, async (c) => {
    try {
        const id = parseInt(c.req.param("id"), 10);
        const { hookName } = c.req.param();
        const result = await executeInstalledAppHook(id, hookName);
        if (result?.code && result.code !== 0) {
            const status = result.code === 404 ? 404 : result.code === 400 ? 400 : 500;
            return c.json(result, status);
        }
        return c.json(result);
    } catch (err) {
        return c.json({ code: 500, message: err.message }, 500);
    }
});

app.delete("/installed/:id", authenticate, async (c) => {
    try {
        const id = parseInt(c.req.param("id"), 10);
        const result = await uninstallApp(id);
        if (result?.code) return c.json(result, result.code === 404 ? 404 : 500);
        return c.json(result);
    } catch (err) {
        return c.json({ code: 500, message: err.message }, 500);
    }
});

app.get("/:source/:slug", authenticate, async (c) => {
    try {
        const { source, slug } = c.req.param();
        const appData = await getApp(source, slug);
        if (!appData) return c.json({ code: 404, message: "App not found" }, 404);
        return c.json(appData);
    } catch (err) {
        return c.json({ code: 500, message: err.message }, 500);
    }
});

app.get("/:source/:slug/ports", authenticate, async (c) => {
    try {
        const { source, slug } = c.req.param();
        const result = await getAppPortAnalysis(source, slug);
        if (result?.code) return c.json(result, result.code === 404 ? 404 : 500);
        return c.json(result);
    } catch (err) {
        return c.json({ code: 500, message: err.message }, 500);
    }
});

app.post("/:source/:slug/install", authenticate, async (c) => {
    try {
        const { source, slug } = c.req.param();
        const body = await c.req.json();
        const error = validateSchema(appInstallValidation, body);
        if (error) return c.json({ message: error }, 400);

        const result = await installApp(source, slug, body.serverId, body.inputs || {}, body.portMappings || null);
        if (result?.code) {
            const status = result.code === 404 ? 404 : result.code === 505 ? 409 : 500;
            return c.json(result, status);
        }
        return c.json(result, 201);
    } catch (err) {
        return c.json({ code: 500, message: err.message }, 500);
    }
});

module.exports = app;
