const Account = require("../models/Account");
const Session = require("../models/Session");

module.exports.authenticate = async (c, next) => {
    const authHeader = c.req.header("authorization");
    if (!authHeader)
        return c.json({ message: "You need to provide the 'authorization' header" }, 400);

    const headerTrimmed = authHeader.split(" ");
    if (headerTrimmed.length !== 2)
        return c.json({ message: "You need to provide the token in the 'authorization' header" }, 400);

    const session = await Session.findOne({ where: { token: headerTrimmed[1] } });

    if (session === null)
        return c.json({ message: "The provided token is not valid" }, 401);

    const ip = c.req.header("x-forwarded-for") || "unknown";
    await Session.update({ lastActivity: new Date(), ip }, { where: { id: session.id } });

    const user = await Account.findByPk(session.accountId);
    if (user === null)
        return c.json({ message: "The account associated to the token is not registered" }, 401);

    c.set("session", session);
    c.set("user", user);
    await next();
};