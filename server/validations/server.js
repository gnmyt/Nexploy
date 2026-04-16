const Joi = require("joi");

module.exports.createServerValidation = Joi.object({
    name: Joi.string().min(1).max(100).required(),
    location: Joi.string().max(100).allow("", null),
    type: Joi.string().valid("ssh").default("ssh"),
    host: Joi.string().min(1).max(255).required(),
    port: Joi.number().integer().min(1).max(65535).default(22),
    username: Joi.string().min(1).max(100).required(),
    authMethod: Joi.string().valid("password", "ssh-key").default("password"),
    password: Joi.string().max(500).when("authMethod", {
        is: "password",
        then: Joi.required(),
        otherwise: Joi.forbidden(),
    }),
    sshKey: Joi.string().max(10000).when("authMethod", {
        is: "ssh-key",
        then: Joi.required(),
        otherwise: Joi.forbidden(),
    }),
    passphrase: Joi.string().max(500).allow("", null).when("authMethod", {
        is: "ssh-key",
        then: Joi.optional(),
        otherwise: Joi.forbidden(),
    }),
});

module.exports.updateServerValidation = Joi.object({
    name: Joi.string().min(1).max(100),
    location: Joi.string().max(100).allow("", null),
    host: Joi.string().min(1).max(255),
    port: Joi.number().integer().min(1).max(65535),
    username: Joi.string().min(1).max(100),
    authMethod: Joi.string().valid("password", "ssh-key"),
    password: Joi.string().max(500).when("authMethod", {
        is: "password",
        then: Joi.optional(),
        otherwise: Joi.forbidden(),
    }),
    sshKey: Joi.string().max(10000).when("authMethod", {
        is: "ssh-key",
        then: Joi.optional(),
        otherwise: Joi.forbidden(),
    }),
    passphrase: Joi.string().max(500).allow("", null).when("authMethod", {
        is: "ssh-key",
        then: Joi.optional(),
        otherwise: Joi.forbidden(),
    }),
}).min(1);

module.exports.executeCommandValidation = Joi.object({
    command: Joi.string().min(1).max(10000).required(),
});
