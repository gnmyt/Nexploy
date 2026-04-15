const Joi = require("joi");

module.exports.gitCredentialCreateValidation = Joi.object({
    name: Joi.string().min(1).max(100).pattern(/^[a-zA-Z0-9_\- ]+$/).required(),
    host: Joi.string().min(1).max(500).required(),
    authType: Joi.string().valid("token", "basic").default("token"),
    username: Joi.string().max(200).allow("", null),
    token: Joi.string().max(5000).required(),
});

module.exports.gitCredentialUpdateValidation = Joi.object({
    name: Joi.string().min(1).max(100).pattern(/^[a-zA-Z0-9_\- ]+$/),
    host: Joi.string().min(1).max(500),
    authType: Joi.string().valid("token", "basic"),
    username: Joi.string().max(200).allow("", null),
    token: Joi.string().max(5000).allow("", null),
}).min(1);
