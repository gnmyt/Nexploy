module.exports.sendError = (c, httpCode, errorCode, message) =>
    c.json({ code: errorCode, message }, httpCode);