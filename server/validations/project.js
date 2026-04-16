const Joi = require("joi");

module.exports.projectCreateValidation = Joi.object({
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500).allow("", null),
});

module.exports.projectUpdateValidation = Joi.object({
    name: Joi.string().min(1).max(100),
    description: Joi.string().max(500).allow("", null),
}).min(1);

module.exports.projectMemberValidation = Joi.object({
    accountId: Joi.number().integer().required(),
    permission: Joi.string().valid("view", "deploy", "manage").required(),
});

module.exports.projectResourceValidation = Joi.object({
    resourceType: Joi.string().valid("server", "stack", "container", "deployment").required(),
    resourceId: Joi.number().integer().required(),
});
