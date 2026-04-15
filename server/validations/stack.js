const Joi = require("joi");

module.exports.stackActionValidation = Joi.object({
    action: Joi.string().valid("start", "stop", "restart", "down").required(),
});

module.exports.stackComposeValidation = Joi.object({
    content: Joi.string().min(1).max(1048576).required(),
});

module.exports.stackCreateValidation = Joi.object({
    serverId: Joi.number().integer().positive().required(),
    name: Joi.string().min(1).max(100).pattern(/^[a-zA-Z0-9_-]+$/).required(),
    composeContent: Joi.string().min(1).max(1048576).required(),
});
