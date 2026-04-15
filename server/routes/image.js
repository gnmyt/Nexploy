const { Hono } = require("hono");
const { listImages, pullImage, removeImage, pruneImages } = require("../controllers/image");
const { authenticate } = require("../middlewares/auth");

const app = new Hono();

app.get("/", authenticate, async (c) => {
    const serverId = c.req.query("serverId") ? Number.parseInt(c.req.query("serverId"), 10) : null;
    const images = await listImages(serverId);
    return c.json(images);
});

app.post("/pull", authenticate, async (c) => {
    const body = await c.req.json();
    const { serverId, image } = body;

    if (!serverId || !image) {
        return c.json({ message: "serverId and image are required" }, 400);
    }

    if (typeof image !== "string" || image.length > 256 || !/^[a-zA-Z0-9][a-zA-Z0-9._\-/:@]*$/.test(image)) {
        return c.json({ message: "Invalid image name" }, 400);
    }

    const result = await pullImage(Number.parseInt(serverId, 10), image);
    if (result?.code) return c.json(result, 400);
    return c.json(result);
});

app.delete("/:serverId/:imageId", authenticate, async (c) => {
    const serverId = Number.parseInt(c.req.param("serverId"), 10);
    const imageId = c.req.param("imageId");
    const force = c.req.query("force") === "true";

    if (Number.isNaN(serverId)) return c.json({ message: "Invalid server ID" }, 400);

    const result = await removeImage(serverId, imageId, force);
    if (result?.code) return c.json(result, 400);
    return c.json(result);
});

app.post("/prune/:serverId", authenticate, async (c) => {
    const serverId = Number.parseInt(c.req.param("serverId"), 10);
    if (Number.isNaN(serverId)) return c.json({ message: "Invalid server ID" }, 400);

    const result = await pruneImages(serverId);
    if (result?.code) return c.json(result, 400);
    return c.json(result);
});

module.exports = app;
