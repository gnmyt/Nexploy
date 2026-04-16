const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("project_resources", {
    projectId: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    resourceType: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    resourceId: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },
}, {
    freezeTableName: true,
});
