const adapterRegistry = {};

const registerAdapter = (type, AdapterClass) => {
    adapterRegistry[type] = AdapterClass;
};

const getAdapterClass = (type) => adapterRegistry[type] || null;

const getAdapterTypes = () => Object.keys(adapterRegistry);

const createAdapter = (server, session) => {
    const AdapterClass = getAdapterClass(server.type);
    if (!AdapterClass) return null;
    return new AdapterClass(server, session);
};

registerAdapter("ssh", require("./SSHAdapter"));

module.exports = { registerAdapter, getAdapterClass, getAdapterTypes, createAdapter };
