const Sequelize = require("sequelize");
const db = require("../utils/database");

module.exports = db.define("projects", {
    name: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
    },
    description: {
        type: Sequelize.TEXT,
        allowNull: true,
    },
}, {
    freezeTableName: true,
});
