const { syncAllSources, ensureDefaultSource } = require("../../controllers/source");
const logger = require("../../utils/logger");

module.exports = async () => {
    await ensureDefaultSource();
    logger.info("Starting source sync for all enabled sources");
    await syncAllSources();
};
