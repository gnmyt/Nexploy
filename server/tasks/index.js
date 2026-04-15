const { registerTaskHandler } = require("./taskRunner");
const updateContainersHandler = require("./handlers/updateContainers");

const initializeTaskHandlers = () => {
    registerTaskHandler("UpdateContainers", updateContainersHandler);
};

module.exports = { initializeTaskHandlers };
