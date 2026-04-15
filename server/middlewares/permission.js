module.exports.isAdmin = async (c, next) => {
    if (c.get("user").role !== "admin") {
        return c.json({ code: 403, message: "Forbidden" }, 403);
    }

    await next();
}