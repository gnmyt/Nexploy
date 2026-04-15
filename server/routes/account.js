const { Hono } = require("hono");
const { registerValidation, totpSetup, passwordChangeValidation, updateNameValidation, updateSessionSyncValidation } = require("../validations/account");
const { createAccount, updateTOTP, updatePassword, updateName, updateSessionSync } = require("../controllers/account");
const speakeasy = require("speakeasy");
const { authenticate } = require("../middlewares/auth");
const { validateSchema } = require("../utils/schema");
const { sendError } = require("../utils/error");

const app = new Hono();

app.get("/me", authenticate, async (c) => {
    const user = c.get("user");
    if (!user) return sendError(c, 401, 205, "You are not authenticated.");

    return c.json({
        id: user.id, username: user.username, totpEnabled: user.totpEnabled,
        firstName: user.firstName, lastName: user.lastName, role: user.role,
        sessionSync: user.sessionSync,
    });
});

app.patch("/password", authenticate, async (c) => {
    const body = await c.req.json();
    const error = validateSchema(passwordChangeValidation, body);
    if (error) return c.json({ message: error }, 400);

    const user = c.get("user");
    if (!user) return sendError(c, 401, 205, "You are not authenticated.");

    await updatePassword(user.id, body.password);

    return c.json({ message: "Your password has been successfully updated." });
});

app.patch("/name", authenticate, async (c) => {
    const user = c.get("user");
    if (!user) return sendError(c, 401, 205, "You are not authenticated.");

    const body = await c.req.json();
    const error = validateSchema(updateNameValidation, body);
    if (error) return c.json({ message: error }, 400);

    await updateName(user.id, body);

    return c.json({ message: "Your name has been successfully updated." });
});

app.post("/register", async (c) => {
    const body = await c.req.json();
    const error = validateSchema(registerValidation, body);
    if (error) return c.json({ message: error }, 400);

    const account = await createAccount(body);
    if (account) return c.json(account);

    return c.json({ message: "Your account has been successfully created." });
});

app.get("/totp/secret", authenticate, async (c) => {
    const user = c.get("user");
    return c.json({
        secret: user?.totpSecret,
        url: `otpauth://totp/Nexploy%20%28${user?.username}%29?secret=${user?.totpSecret}`,
    });
});

app.post("/totp/enable", authenticate, async (c) => {
    const body = await c.req.json();
    const error = validateSchema(totpSetup, body);
    if (error) return c.json({ message: error }, 400);

    const user = c.get("user");
    const tokenCorrect = speakeasy.totp.verify({
        secret: user?.totpSecret || "",
        encoding: "base32",
        token: body.code,
    });

    if (!tokenCorrect)
        return sendError(c, 400, 203, "Your provided code is invalid or has expired.");

    const enabledError = await updateTOTP(user?.id, true);
    if (enabledError) return c.json(enabledError);

    return c.json({ message: "TOTP has been successfully enabled on your account." });
});

app.post("/totp/disable", authenticate, async (c) => {
    const user = c.get("user");
    const enabledError = await updateTOTP(user.id, false);
    if (enabledError) return c.json(enabledError);

    return c.json({ message: "TOTP has been successfully disabled on your account." });
});

app.patch("/session-sync", authenticate, async (c) => {
    const body = await c.req.json();
    const error = validateSchema(updateSessionSyncValidation, body);
    if (error) return c.json({ message: error }, 400);

    const user = c.get("user");
    const result = await updateSessionSync(user.id, body.sessionSync);
    if (result) return c.json(result);

    return c.json({ message: "Session synchronization mode has been successfully updated." });
});

module.exports = app;