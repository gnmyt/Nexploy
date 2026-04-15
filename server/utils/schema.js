module.exports.validateSchema = (schema, object) => {
    const { error } = schema.validate(object, { errors: { wrap: { label: "" } } });
    if (error) return error.details[0].message || "No message provided";
    return null;
};
