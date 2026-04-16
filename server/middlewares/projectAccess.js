const ProjectMember = require("../models/ProjectMember");
const ProjectResource = require("../models/ProjectResource");
const { Op } = require("sequelize");

const PERMISSION_LEVELS = {
    view: 0,
    deploy: 1,
    manage: 2,
};

const getUserProjectIds = async (accountId, minPermission = "view") => {
    const minLevel = PERMISSION_LEVELS[minPermission] || 0;
    const allowedPermissions = Object.entries(PERMISSION_LEVELS)
        .filter(([, level]) => level >= minLevel)
        .map(([perm]) => perm);

    const memberships = await ProjectMember.findAll({
        where: {
            accountId,
            permission: { [Op.in]: allowedPermissions },
        },
        attributes: ["projectId"],
    });

    return memberships.map(m => m.projectId);
};

const getAccessibleResourceIds = async (accountId, resourceType, minPermission = "view") => {
    const projectIds = await getUserProjectIds(accountId, minPermission);
    if (projectIds.length === 0) return [];

    const resources = await ProjectResource.findAll({
        where: {
            projectId: { [Op.in]: projectIds },
            resourceType,
        },
        attributes: ["resourceId"],
    });

    return resources.map(r => r.resourceId);
};

const hasResourceAccess = async (accountId, resourceType, resourceId, minPermission = "view") => {
    const projectIds = await getUserProjectIds(accountId, minPermission);
    if (projectIds.length === 0) return false;

    const resource = await ProjectResource.findOne({
        where: {
            projectId: { [Op.in]: projectIds },
            resourceType,
            resourceId,
        },
    });

    return !!resource;
};

const requireResourceAccess = (resourceType, paramName = "id", minPermission = "view") => {
    return async (c, next) => {
        const user = c.get("user");
        if (user.role === "admin") return next();

        const resourceId = parseInt(c.req.param(paramName), 10);
        if (isNaN(resourceId)) return c.json({ code: 400, message: "Invalid resource ID" }, 400);

        if (await hasResourceAccess(user.id, resourceType, resourceId, minPermission)) {
            return next();
        }

        if (resourceType === "stack" || resourceType === "deployment") {
            const Model = resourceType === "stack"
                ? require("../models/Stack")
                : require("../models/Deployment");
            const resource = await Model.findByPk(resourceId);
            if (resource && resource.serverId) {
                if (await hasResourceAccess(user.id, "server", resource.serverId, minPermission)) {
                    return next();
                }
            }
        }

        return c.json({ code: 403, message: "You don't have access to this resource" }, 403);
    };
};

const hasContainerAccess = async (accountId, containerId, minPermission = "view") => {
    const Container = require("../models/Container");
    const container = await Container.findOne({ where: { containerId } });
    if (!container) return false;

    if (await hasResourceAccess(accountId, "container", container.id, minPermission)) return true;

    return hasResourceAccess(accountId, "server", container.serverId, minPermission);
};

module.exports = {
    PERMISSION_LEVELS,
    getUserProjectIds,
    getAccessibleResourceIds,
    hasResourceAccess,
    requireResourceAccess,
    hasContainerAccess,
};
