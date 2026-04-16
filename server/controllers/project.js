const Project = require("../models/Project");
const ProjectMember = require("../models/ProjectMember");
const ProjectResource = require("../models/ProjectResource");
const Account = require("../models/Account");
const logger = require("../utils/logger");

module.exports.listProjects = async (user) => {
    if (user.role === "admin") {
        return Project.findAll();
    }

    const memberships = await ProjectMember.findAll({
        where: { accountId: user.id },
        attributes: ["projectId"],
    });
    const projectIds = memberships.map(m => m.projectId);
    if (projectIds.length === 0) return [];

    return Project.findAll({ where: { id: projectIds } });
};

module.exports.getProject = async (id) => {
    const project = await Project.findByPk(id);
    if (!project) return { code: 901, message: "Project not found" };
    return project;
};

module.exports.createProject = async (data) => {
    const existing = await Project.findOne({ where: { name: data.name } });
    if (existing) return { code: 902, message: "A project with this name already exists" };

    const project = await Project.create(data);
    logger.system("Project created", { projectId: project.id, name: project.name });
    return project;
};

module.exports.updateProject = async (id, data) => {
    const project = await Project.findByPk(id);
    if (!project) return { code: 901, message: "Project not found" };

    if (data.name && data.name !== project.name) {
        const existing = await Project.findOne({ where: { name: data.name } });
        if (existing) return { code: 902, message: "A project with this name already exists" };
    }

    await Project.update(data, { where: { id } });
    logger.system("Project updated", { projectId: id });
    return Project.findByPk(id);
};

module.exports.deleteProject = async (id) => {
    const project = await Project.findByPk(id);
    if (!project) return { code: 901, message: "Project not found" };

    await ProjectResource.destroy({ where: { projectId: id } });
    await ProjectMember.destroy({ where: { projectId: id } });
    await Project.destroy({ where: { id } });

    logger.system("Project deleted", { projectId: id, name: project.name });
};

module.exports.listMembers = async (projectId) => {
    const project = await Project.findByPk(projectId);
    if (!project) return { code: 901, message: "Project not found" };

    const members = await ProjectMember.findAll({ where: { projectId } });

    const enriched = await Promise.all(members.map(async (member) => {
        const account = await Account.findByPk(member.accountId, {
            attributes: ["id", "firstName", "lastName", "username", "role"],
        });
        return {
            id: member.id,
            projectId: member.projectId,
            accountId: member.accountId,
            permission: member.permission,
            account: account || null,
        };
    }));

    return enriched;
};

module.exports.addMember = async (projectId, accountId, permission) => {
    const project = await Project.findByPk(projectId);
    if (!project) return { code: 901, message: "Project not found" };

    const account = await Account.findByPk(accountId);
    if (!account) return { code: 903, message: "Account not found" };

    const existing = await ProjectMember.findOne({ where: { projectId, accountId } });
    if (existing) return { code: 904, message: "User is already a member of this project" };

    const member = await ProjectMember.create({ projectId, accountId, permission });
    logger.system("Project member added", { projectId, accountId, permission });
    return member;
};

module.exports.updateMember = async (projectId, memberId, permission) => {
    const member = await ProjectMember.findOne({ where: { id: memberId, projectId } });
    if (!member) return { code: 905, message: "Member not found" };

    await ProjectMember.update({ permission }, { where: { id: memberId } });
    logger.system("Project member updated", { projectId, memberId, permission });
    return ProjectMember.findByPk(memberId);
};

module.exports.removeMember = async (projectId, memberId) => {
    const member = await ProjectMember.findOne({ where: { id: memberId, projectId } });
    if (!member) return { code: 905, message: "Member not found" };

    await ProjectMember.destroy({ where: { id: memberId } });
    logger.system("Project member removed", { projectId, memberId });
};

module.exports.listResources = async (projectId) => {
    const project = await Project.findByPk(projectId);
    if (!project) return { code: 901, message: "Project not found" };

    return ProjectResource.findAll({ where: { projectId } });
};

module.exports.addResource = async (projectId, resourceType, resourceId) => {
    const project = await Project.findByPk(projectId);
    if (!project) return { code: 901, message: "Project not found" };

    const existing = await ProjectResource.findOne({ where: { projectId, resourceType, resourceId } });
    if (existing) return { code: 906, message: "Resource is already assigned to this project" };

    const resource = await ProjectResource.create({ projectId, resourceType, resourceId });
    logger.system("Project resource added", { projectId, resourceType, resourceId });
    return resource;
};

module.exports.removeResource = async (projectId, resourceId) => {
    const resource = await ProjectResource.findOne({ where: { id: resourceId, projectId } });
    if (!resource) return { code: 907, message: "Resource assignment not found" };

    await ProjectResource.destroy({ where: { id: resourceId } });
    logger.system("Project resource removed", { projectId, resourceId });
};
