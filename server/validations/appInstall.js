const Joi = require("joi");

module.exports.appInstallValidation = Joi.object({
    serverId: Joi.number().integer().positive().required(),
    inputs: Joi.object().pattern(Joi.string(), Joi.alternatives().try(
        Joi.string().allow(""),
        Joi.number(),
        Joi.boolean()
    )).optional(),
    portMappings: Joi.array().items(Joi.object({
        host: Joi.number().integer().min(1).max(65535).required(),
        container: Joi.number().integer().min(1).max(65535).required(),
    })).optional().allow(null),
});
