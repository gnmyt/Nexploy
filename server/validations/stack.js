const Joi = require("joi");

module.exports.stackActionValidation = Joi.object({
    action: Joi.string().valid("start", "stop", "restart", "down").required(),
});

module.exports.stackComposeValidation = Joi.object({
    content: Joi.string().min(1).max(1048576).required(),
});

module.exports.stackConfigFileValidation = Joi.object({
    path: Joi.string().min(1).max(4096).required(),
    content: Joi.string().min(0).max(1048576).required(),
});

module.exports.stackSqliteQueryValidation = Joi.object({
    path: Joi.string().min(1).max(4096).required(),
    query: Joi.string().min(1).max(10000).required(),
});

module.exports.stackCreateValidation = Joi.object({
    serverId: Joi.number().integer().positive().required(),
    name: Joi.string().min(1).max(100).pattern(/^[a-zA-Z0-9_-]+$/).required(),
    composeContent: Joi.string().min(1).max(1048576).required(),
});

module.exports.stackEnvValidation = Joi.object({
    variables: Joi.array().items(
        Joi.object({
            key: Joi.string().min(1).max(512).pattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/).required(),
            value: Joi.string().allow("").max(8192).required(),
        })
    ).max(500).required(),
});
