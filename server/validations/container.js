const Joi = require("joi");

module.exports.containerActionValidation = Joi.object({
    action: Joi.string().valid("start", "stop", "restart", "pause", "unpause", "kill").required(),
});