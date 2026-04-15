const GitCredential = require("../models/GitCredential");
const { encrypt, decrypt } = require("../utils/encryption");
const logger = require("../utils/logger");

module.exports.listGitCredentials = async () => {
    const credentials = await GitCredential.findAll({ order: [["name", "ASC"]] });
    return credentials.map(c => ({
        id: c.id,
        name: c.name,
        host: c.host,
        authType: c.authType,
        username: c.username,
        hasToken: !!c.token,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
    }));
};

module.exports.getGitCredential = async (id) => {
    const cred = await GitCredential.findByPk(id);
    if (!cred) return { code: 701, message: "Git credential not found" };
    return {
        id: cred.id,
        name: cred.name,
        host: cred.host,
        authType: cred.authType,
        username: cred.username,
        hasToken: !!cred.token,
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt,
    };
};

module.exports.createGitCredential = async (data) => {
    const { name, host, authType, username, token } = data;

    const existing = await GitCredential.findOne({ where: { name } });
    if (existing) return { code: 705, message: "A git credential with this name already exists" };

    const encryptedToken = token ? JSON.stringify(encrypt(token)) : null;

    const cred = await GitCredential.create({
        name,
        host,
        authType: authType || "token",
        username: username || null,
        token: encryptedToken,
    });

    logger.info("Git credential created", { id: cred.id, name });
    return {
        id: cred.id,
        name: cred.name,
        host: cred.host,
        authType: cred.authType,
        username: cred.username,
        hasToken: !!cred.token,
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt,
    };
};

module.exports.updateGitCredential = async (id, data) => {
    const cred = await GitCredential.findByPk(id);
    if (!cred) return { code: 701, message: "Git credential not found" };

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.host !== undefined) updates.host = data.host;
    if (data.authType !== undefined) updates.authType = data.authType;
    if (data.username !== undefined) updates.username = data.username || null;
    if (data.token !== undefined) {
        updates.token = data.token ? JSON.stringify(encrypt(data.token)) : null;
    }

    await GitCredential.update(updates, { where: { id } });
    const updated = await GitCredential.findByPk(id);
    logger.info("Git credential updated", { id, name: updated.name });
    return {
        id: updated.id,
        name: updated.name,
        host: updated.host,
        authType: updated.authType,
        username: updated.username,
        hasToken: !!updated.token,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
    };
};

module.exports.deleteGitCredential = async (id) => {
    const cred = await GitCredential.findByPk(id);
    if (!cred) return { code: 701, message: "Git credential not found" };

    await GitCredential.destroy({ where: { id } });
    logger.info("Git credential deleted", { id, name: cred.name });
    return { message: "Git credential deleted" };
};

/**
 * Resolves the authenticated git clone URL for a deployment.
 * Matches the deployment's repoUrl host against stored credentials.
 */
module.exports.resolveGitUrl = async (repoUrl, gitCredentialId = null) => {
    let cred = null;

    if (gitCredentialId) {
        cred = await GitCredential.findByPk(gitCredentialId);
    }

    if (!cred) {
        try {
            const urlObj = new URL(repoUrl);
            cred = await GitCredential.findOne({ where: { host: urlObj.hostname } });
        } catch {}
    }

    if (!cred || !cred.token) return repoUrl;

    let decryptedToken;
    try {
        const parsed = JSON.parse(cred.token);
        decryptedToken = decrypt(parsed.encrypted, parsed.iv, parsed.authTag);
    } catch {
        return repoUrl;
    }

    if (!decryptedToken) return repoUrl;

    try {
        const urlObj = new URL(repoUrl);

        if (cred.authType === "token") {
            urlObj.username = decryptedToken;
            urlObj.password = "";
        } else if (cred.authType === "basic") {
            urlObj.username = cred.username || "";
            urlObj.password = decryptedToken;
        }

        return urlObj.toString();
    } catch {
        return repoUrl;
    }
};
