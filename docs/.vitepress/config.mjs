import { defineConfig } from "vitepress";

import { useSidebar } from "vitepress-openapi";
import { exec } from "child_process";
import { promisify } from "util";
import spec from "../public/openapi.json";

const execAsync = promisify(exec);

const sidebar = useSidebar({ spec, linkPrefix: "/operations/" });

export default defineConfig({
    title: "Nexploy",
    description: "App deployments & container management made stupid simple.",
    lastUpdated: true,
    cleanUrls: true,
    metaChunk: true,

    buildEnd: async () => {
        try {
            console.log("Regenerating OpenAPI specification...");
            await execAsync("node scripts/generate-openapi.js", { cwd: "./" });
            console.log("OpenAPI specification updated successfully!");
        } catch (error) {
            console.warn("Warning: Could not regenerate OpenAPI spec:", error.message);
        }
    },

    head: [
        ["link", { rel: "icon", type: "image/png", href: "/logo.png" }],
        ["meta", { name: "theme-color", content: "#9333EA" }],
        ["meta", { property: "og:type", content: "website" }],
        ["meta", { property: "og:locale", content: "en" }],
        ["meta", {
            property: "og:title",
            content: "Nexploy | App deployments & container management made stupid simple.",
        }],
        ["meta", { property: "og:site_name", content: "Nexploy" }],
        ["meta", { property: "og:image", content: "/thumbnail.png" }],
        ["meta", { property: "og:image:type", content: "image/png" }],
        ["meta", { property: "twitter:card", content: "summary_large_image" }],
        ["meta", { property: "twitter:image:src", content: "/thumbnail.png" }],
        ["meta", { property: "og:url", content: "https://nexploy.gnm.dev" }],
    ],
    themeConfig: {

        logo: "/logo.png",

        nav: [
            { text: "Home", link: "/" },
            { text: "Preview", link: "/preview" },
        ],

        footer: {
            message: "Distributed under the MIT License",
            copyright: "© 2025 Mathias Wagner",
        },
        search: {
            provider: "local",
        },

        sidebar: [
            {
                text: "Documentation",
                items: [
                    { text: "Home", link: "/" },
                    { text: "Preview", link: "/preview" },
                    { text: "Contributing", link: "/contributing" },
                    {
                        text: "API Reference",
                        collapsed: true,
                        link: "/api-reference",
                        items: [...sidebar.generateSidebarGroups()],
                    },
                ],
            },
        ],

        socialLinks: [
            { icon: "github", link: "https://github.com/gnmyt/Nexploy" },
            { icon: "discord", link: "https://dc.gnmyt.dev" },
        ],
    },
});