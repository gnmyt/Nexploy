const Source = require("../models/Source");
const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");
const yaml = require("yaml");

const SOURCES_DIR = path.join(process.cwd(), "data", "sources");

const parseNPINDEX = (content) => {
    const lines = content.split("\n").map(l => l.trim()).filter(l => l);
    if (!lines.length || !lines[0].startsWith("#!NPINDEX1 ")) return null;

    const name = lines[0].replace("#!NPINDEX1 ", "").trim();
    const apps = [];

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].startsWith("#")) continue;
        const [slug, version] = lines[i].split("@");
        if (slug && version) apps.push({ slug, version });
    }

    return { name, apps };
};

const fetchNPINDEX = async (url) => {
    const indexUrl = url.endsWith("/") ? `${url}NPINDEX` : `${url}/NPINDEX`;
    const response = await fetch(indexUrl, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Failed to fetch NPINDEX: ${response.status}`);
    return response.text();
};

const validateSourceUrl = async (url) => {
    const content = await fetchNPINDEX(url);
    const parsed = parseNPINDEX(content);
    if (!parsed) throw new Error("Invalid NPINDEX format");
    return parsed;
};

const listSources = async () => {
    const sources = await Source.findAll({ order: [["isDefault", "DESC"], ["name", "ASC"]] });

    return sources.map(s => {
        const sourceDir = path.join(SOURCES_DIR, s.name);
        let appCount = 0;
        if (fs.existsSync(sourceDir)) {
            for (const letter of fs.readdirSync(sourceDir)) {
                const letterDir = path.join(sourceDir, letter);
                if (fs.statSync(letterDir).isDirectory()) {
                    appCount += fs.readdirSync(letterDir).filter(f =>
                        fs.statSync(path.join(letterDir, f)).isDirectory()
                    ).length;
                }
            }
        }

        return {
            name: s.name,
            url: s.url,
            enabled: s.enabled,
            isDefault: s.isDefault,
            lastSyncStatus: s.lastSyncStatus,
            appCount,
        };
    });
};

const createSource = async (url) => {
    const parsed = await validateSourceUrl(url);

    const existing = await Source.findOne({ where: { name: parsed.name } });
    if (existing) throw new Error(`Source "${parsed.name}" already exists`);

    const source = await Source.create({ name: parsed.name, url });
    return source;
};

const updateSource = async (name, updates) => {
    const source = await Source.findOne({ where: { name } });
    if (!source) throw new Error("Source not found");

    if (updates.url && updates.url !== source.url) {
        await validateSourceUrl(updates.url);
    }

    await Source.update(updates, { where: { name } });
    return { ...source, ...updates };
};

const deleteSource = async (name) => {
    const source = await Source.findOne({ where: { name } });
    if (!source) throw new Error("Source not found");
    if (source.isDefault) throw new Error("Cannot delete the default source");

    const sourceDir = path.join(SOURCES_DIR, name);
    if (fs.existsSync(sourceDir)) {
        fs.rmSync(sourceDir, { recursive: true, force: true });
    }

    await Source.destroy({ where: { name } });
};

const syncSource = async (name) => {
    const source = await Source.findOne({ where: { name } });
    if (!source) throw new Error("Source not found");
    if (!source.enabled) throw new Error("Source is disabled");

    try {
        const content = await fetchNPINDEX(source.url);
        const parsed = parseNPINDEX(content);
        if (!parsed) throw new Error("Invalid NPINDEX format");

        const baseUrl = source.url.endsWith("/") ? source.url : `${source.url}/`;
        const sourceDir = path.join(SOURCES_DIR, source.name);

        const currentSlugs = new Set();

        for (const app of parsed.apps) {
            currentSlugs.add(app.slug);
            const firstLetter = app.slug.charAt(0).toLowerCase();
            const appDir = path.join(sourceDir, firstLetter, app.slug);

            const manifestPath = path.join(appDir, "manifest.yml");
            const altManifestPath = path.join(appDir, "manifest.yaml");
            const existingManifestPath = fs.existsSync(manifestPath) ? manifestPath
                : fs.existsSync(altManifestPath) ? altManifestPath
                : null;

            if (existingManifestPath) {
                try {
                    const existing = yaml.parse(fs.readFileSync(existingManifestPath, "utf-8"));
                    if (existing.version === app.version) continue;
                } catch {}
            }

            fs.mkdirSync(appDir, { recursive: true });

            const manifest = await fetchAppFile(baseUrl, firstLetter, app.slug, "manifest.yml")
                || await fetchAppFile(baseUrl, firstLetter, app.slug, "manifest.yaml");

            if (!manifest) {
                logger.warn(`No manifest found for ${app.slug} in source ${source.name}`);
                continue;
            }

            fs.writeFileSync(path.join(appDir, "manifest.yml"), manifest);

            const parsed_manifest = yaml.parse(manifest);

            if (parsed_manifest.type === "docker") {
                const compose = await fetchAppFile(baseUrl, firstLetter, app.slug, "docker-compose.yml")
                    || await fetchAppFile(baseUrl, firstLetter, app.slug, "docker-compose.yaml");
                if (compose) fs.writeFileSync(path.join(appDir, "docker-compose.yml"), compose);
            }

            const logo = await fetchAppBinary(baseUrl, firstLetter, app.slug, "logo.png");
            if (logo) fs.writeFileSync(path.join(appDir, "logo.png"), Buffer.from(logo));

            if (parsed_manifest.gallery && Array.isArray(parsed_manifest.gallery)) {
                const galleryDir = path.join(appDir, "gallery");
                fs.mkdirSync(galleryDir, { recursive: true });

                for (const galleryPath of parsed_manifest.gallery) {
                    const filename = path.basename(galleryPath);
                    const data = await fetchAppBinary(baseUrl, firstLetter, app.slug, galleryPath);
                    if (data) fs.writeFileSync(path.join(galleryDir, filename), Buffer.from(data));
                }
            }
        }

        if (fs.existsSync(sourceDir)) {
            for (const letter of fs.readdirSync(sourceDir)) {
                const letterDir = path.join(sourceDir, letter);
                if (!fs.statSync(letterDir).isDirectory()) continue;
                for (const slug of fs.readdirSync(letterDir)) {
                    if (!currentSlugs.has(slug)) {
                        fs.rmSync(path.join(letterDir, slug), { recursive: true, force: true });
                    }
                }
            }
        }

        await Source.update({
            lastSyncStatus: "success",
            lastSyncVersion: content.split("\n")[0],
            appCount: parsed.apps.length,
        }, { where: { name } });

        logger.info(`Source "${source.name}" synced successfully (${parsed.apps.length} apps)`);
        return { success: true };
    } catch (err) {
        await Source.update({ lastSyncStatus: "error" }, { where: { name } });
        logger.error(`Source "${source.name}" sync failed`, { error: err.message });
        return { success: false, error: err.message };
    }
};

const fetchAppFile = async (baseUrl, letter, slug, filename) => {
    try {
        const url = `${baseUrl}${letter}/${slug}/${filename}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) return null;
        return response.text();
    } catch {
        return null;
    }
};

const fetchAppBinary = async (baseUrl, letter, slug, filePath) => {
    try {
        const url = `${baseUrl}${letter}/${slug}/${filePath}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) return null;
        return response.arrayBuffer();
    } catch {
        return null;
    }
};

const getAppsFromDisk = (sourceName) => {
    const sourceDir = path.join(SOURCES_DIR, sourceName);
    const apps = [];

    if (!fs.existsSync(sourceDir)) return apps;

    for (const letter of fs.readdirSync(sourceDir)) {
        const letterDir = path.join(sourceDir, letter);
        if (!fs.statSync(letterDir).isDirectory()) continue;

        for (const slug of fs.readdirSync(letterDir)) {
            const appDir = path.join(letterDir, slug);
            if (!fs.statSync(appDir).isDirectory()) continue;

            const manifestPath = fs.existsSync(path.join(appDir, "manifest.yml"))
                ? path.join(appDir, "manifest.yml")
                : fs.existsSync(path.join(appDir, "manifest.yaml"))
                    ? path.join(appDir, "manifest.yaml")
                    : null;

            if (!manifestPath) continue;

            try {
                const manifest = yaml.parse(fs.readFileSync(manifestPath, "utf-8"));
                const hasLogo = fs.existsSync(path.join(appDir, "logo.png"));
                const galleryFiles = fs.existsSync(path.join(appDir, "gallery"))
                    ? fs.readdirSync(path.join(appDir, "gallery"))
                    : [];

                apps.push({
                    slug,
                    source: sourceName,
                    ...manifest,
                    hasLogo,
                    galleryCount: galleryFiles.length,
                    gallery: galleryFiles,
                });
            } catch {
                logger.warn(`Failed to parse manifest for ${slug} in ${sourceName}`);
            }
        }
    }

    return apps;
};

const listApps = async ({ page = 1, limit = 24, search, category, type, source: sourceName } = {}) => {
    const sources = await Source.findAll({ where: { enabled: true } });
    let allApps = [];

    for (const src of sources) {
        allApps.push(...getAppsFromDisk(src.name));
    }

    if (search) {
        const q = search.toLowerCase();
        allApps = allApps.filter(a =>
            a.name?.toLowerCase().includes(q) ||
            a.description?.toLowerCase().includes(q) ||
            a.slug?.toLowerCase().includes(q) ||
            a.category?.toLowerCase().includes(q)
        );
    }

    if (category && category !== "all") {
        allApps = allApps.filter(a => a.category === category);
    }

    if (type && type !== "all") {
        allApps = allApps.filter(a => a.type === type);
    }

    if (sourceName && sourceName !== "all") {
        allApps = allApps.filter(a => a.source === sourceName);
    }

    allApps.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const total = allApps.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const apps = allApps.slice(offset, offset + limit);

    const categories = [...new Set(allApps.map(a => a.category).filter(Boolean))].sort();

    return { apps, total, page, totalPages, categories };
};

const getApp = async (sourceName, slug) => {
    const sourceDir = path.join(SOURCES_DIR, sourceName);
    const firstLetter = slug.charAt(0).toLowerCase();
    const appDir = path.join(sourceDir, firstLetter, slug);

    if (!fs.existsSync(appDir)) return null;

    const manifestPath = fs.existsSync(path.join(appDir, "manifest.yml"))
        ? path.join(appDir, "manifest.yml")
        : fs.existsSync(path.join(appDir, "manifest.yaml"))
            ? path.join(appDir, "manifest.yaml")
            : null;

    if (!manifestPath) return null;

    const manifest = yaml.parse(fs.readFileSync(manifestPath, "utf-8"));
    const hasLogo = fs.existsSync(path.join(appDir, "logo.png"));
    const galleryFiles = fs.existsSync(path.join(appDir, "gallery"))
        ? fs.readdirSync(path.join(appDir, "gallery"))
        : [];

    return {
        slug,
        source: sourceName,
        ...manifest,
        hasLogo,
        galleryCount: galleryFiles.length,
        gallery: galleryFiles,
    };
};

const getAppLogo = (sourceName, slug) => {
    const firstLetter = slug.charAt(0).toLowerCase();
    const logoPath = path.join(SOURCES_DIR, sourceName, firstLetter, slug, "logo.png");
    if (!fs.existsSync(logoPath)) return null;
    return logoPath;
};

const getAppGalleryImage = (sourceName, slug, filename) => {
    const firstLetter = slug.charAt(0).toLowerCase();
    const imagePath = path.join(SOURCES_DIR, sourceName, firstLetter, slug, "gallery", filename);
    if (!fs.existsSync(imagePath)) return null;

    const resolved = path.resolve(imagePath);
    const expected = path.resolve(path.join(SOURCES_DIR, sourceName, firstLetter, slug, "gallery"));
    if (!resolved.startsWith(expected)) return null;
    return resolved;
};

const ensureDefaultSource = async () => {
    const existing = await Source.findOne({ where: { isDefault: true } });
    if (!existing) {
        await Source.create({
            name: "official",
            url: "https://gnmyt.github.io/NexStore",
            enabled: true,
            isDefault: true,
        });
        logger.info("Default source created");
    }
};

const syncAllSources = async () => {
    const sources = await Source.findAll({ where: { enabled: true } });
    for (const source of sources) {
        await syncSource(source.name);
    }
};

module.exports = {
    parseNPINDEX,
    validateSourceUrl,
    listSources,
    createSource,
    updateSource,
    deleteSource,
    syncSource,
    syncAllSources,
    ensureDefaultSource,
    listApps,
    getApp,
    getAppLogo,
    getAppGalleryImage,
};
