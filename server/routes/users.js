const { Hono } = require("hono");
const { listUsers, createAccount, deleteAccount, updatePassword, updateRole } = require("../controllers/account");
const { validateSchema } = require("../utils/schema");
const { createUserValidation, updateRoleValidation } = require("../validations/users");
const { createSession } = require("../controllers/session");
const { passwordChangeValidation } = require("../validations/account");

const app = new Hono();

app.get("/list", async (c) => {
    return c.json(await listUsers());
});

app.put("/", async (c) => {
    const body = await c.req.json();
    const error = validateSchema(createUserValidation, body);
    if (error) return c.json({ message: error }, 400);

    const account = await createAccount(body, false);
    if (account?.code) return c.json(account);

    return c.json({ message: "Account got successfully created" });
});

app.post("/:accountId/login", async (c) => {
    const account = await createSession(c.req.param("accountId"), c.req.header("user-agent"));
    if (account?.code) return c.json(account);

    return c.json({ message: "Session got successfully created", token: account.token });
});

app.delete("/:accountId", async (c) => {
    const account = await deleteAccount(c.req.param("accountId"));
    if (account?.code) return c.json(account);

    return c.json({ message: "Account got successfully deleted" });
});

app.patch("/:accountId/password", async (c) => {
    const body = await c.req.json();
    const error = validateSchema(passwordChangeValidation, body);
    if (error) return c.json({ message: error }, 400);

    const account = await updatePassword(c.req.param("accountId"), body.password);
    if (account?.code) return c.json(account);

    return c.json({ message: "Password got successfully updated" });
});

app.patch("/:accountId/role", async (c) => {
    try {
        const user = c.get("user");
        if (user.id === parseInt(c.req.param("accountId")))
            return c.json({ code: 107, message: "You cannot change your own role" }, 400);

        const body = await c.req.json();
        const error = validateSchema(updateRoleValidation, body);
        if (error) return c.json({ message: error }, 400);

        const account = await updateRole(c.req.param("accountId"), body.role);
        if (account?.code) return c.json(account);

        return c.json({ message: "Role got successfully updated" });
    } catch (error) {
        return c.json({ code: 109, message: "You need to provide a correct id" }, 400);
    }
});

module.exports = app;