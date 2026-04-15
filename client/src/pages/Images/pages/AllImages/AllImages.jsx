import "./styles.sass";
import { getRequest, postRequest, deleteRequest } from "@/common/utils/RequestUtil.js";
import { useState, useMemo, useEffect, useCallback } from "react";
import { IconInput } from "@/common/components/IconInput/IconInput.jsx";
import { SelectBox } from "@/common/components/SelectBox/SelectBox.jsx";
import { Button } from "@/common/components/Button/Button.jsx";
import PaginatedTable from "@/common/components/PaginatedTable";
import { Icon } from "@mdi/react";
import {
    mdiMagnify, mdiRefresh, mdiLoading, mdiDownload, mdiDeleteSweep,
    mdiDelete, mdiCubeOutline
} from "@mdi/js";
import { useToast } from "@/common/contexts/ToastContext.jsx";
import PullImageDialog from "../../components/PullImageDialog";

const ITEMS_PER_PAGE = 25;

const formatDate = (ts) => {
    if (!ts) return "-";
    return new Date(ts).toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
};

export const AllImages = () => {
    const { sendToast } = useToast();
    const [images, setImages] = useState([]);
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedServer, setSelectedServer] = useState("all");
    const [pullDialogOpen, setPullDialogOpen] = useState(false);
    const [pruning, setPruning] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    const fetchServers = useCallback(async () => {
        try {
            const data = await getRequest("servers");
            setServers(Array.isArray(data) ? data : []);
        } catch {
            // servers list is optional
        }
    }, []);

    const fetchImages = useCallback(async () => {
        try {
            const url = selectedServer === "all" ? "images" : `images?serverId=${selectedServer}`;
            const data = await getRequest(url);
            setImages(Array.isArray(data) ? data : []);
        } catch {
            sendToast("Error", "Failed to load images");
        } finally {
            setLoading(false);
        }
    }, [sendToast, selectedServer]);

    useEffect(() => {
        fetchServers();
    }, [fetchServers]);

    useEffect(() => {
        setLoading(true);
        fetchImages();
    }, [fetchImages]);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await fetchImages();
            sendToast("Success", "Images refreshed");
        } finally {
            setRefreshing(false);
        }
    };

    const handlePrune = async () => {
        if (selectedServer === "all") {
            sendToast("Warning", "Select a specific server to prune images");
            return;
        }
        setPruning(true);
        try {
            const result = await postRequest(`images/prune/${selectedServer}`);
            sendToast("Success", result.message || "Images pruned");
            fetchImages();
        } catch (err) {
            sendToast("Error", err.message || "Failed to prune images");
        } finally {
            setPruning(false);
        }
    };

    const handleRemoveImage = async (e, serverId, imageId) => {
        e.stopPropagation();
        try {
            await deleteRequest(`images/${serverId}/${encodeURIComponent(imageId)}`);
            sendToast("Success", "Image removed");
            fetchImages();
        } catch (err) {
            sendToast("Error", err.message || "Failed to remove image");
        }
    };

    const handlePullComplete = () => {
        fetchImages();
    };

    const serverOptions = useMemo(() => {
        const opts = [{ label: "All Servers", value: "all" }];
        for (const s of servers) {
            opts.push({ label: s.name, value: String(s.id) });
        }
        return opts;
    }, [servers]);

    const filteredImages = useMemo(() => {
        if (!searchQuery) return images;
        const q = searchQuery.toLowerCase();
        return images.filter(img =>
            img.repository?.toLowerCase().includes(q) ||
            img.tag?.toLowerCase().includes(q) ||
            img.shortId?.toLowerCase().includes(q) ||
            img.serverName?.toLowerCase().includes(q)
        );
    }, [images, searchQuery]);

    const paginatedImages = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredImages.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredImages, currentPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedServer]);

    const columns = useMemo(() => [
        {
            key: "repository",
            label: "Repository",
            render: (img) => <span className="cell-repo" title={img.repository}>{img.repository}</span>,
        },
        {
            key: "tag",
            label: "Tag",
            render: (img) => <span className="tag-badge">{img.tag}</span>,
        },
        {
            key: "shortId",
            label: "Image ID",
            render: (img) => <span className="cell-id" title={img.id}>{img.shortId}</span>,
        },
        {
            key: "sizeFormatted",
            label: "Size",
        },
        {
            key: "created",
            label: "Created",
            render: (img) => formatDate(img.created),
        },
        {
            key: "serverName",
            label: "Server",
        },
        {
            key: "actions",
            label: "Actions",
            render: (img) => (
                <button
                    className="action-btn danger"
                    onClick={(e) => handleRemoveImage(e, img.serverId, img.shortId)}
                    title="Remove image"
                >
                    <Icon path={mdiDelete} />
                </button>
            ),
        },
    ], []);

    if (loading) {
        return (
            <div className="all-images-page loading-state">
                <Icon path={mdiLoading} spin={true} size={2} />
                <p>Loading images...</p>
            </div>
        );
    }

    return (
        <div className="all-images-page">
            <div className="images-filters">
                <div className="images-search">
                    <IconInput
                        type="text"
                        placeholder="Search images..."
                        icon={mdiMagnify}
                        value={searchQuery}
                        setValue={setSearchQuery}
                    />
                </div>
                <div className="filter-group">
                    <SelectBox
                        options={serverOptions}
                        selected={selectedServer}
                        setSelected={setSelectedServer}
                    />
                </div>
                <Button
                    icon={mdiDownload}
                    text="Pull Image"
                    onClick={() => setPullDialogOpen(true)}
                />
                <Button
                    icon={pruning ? mdiLoading : mdiDeleteSweep}
                    text="Prune"
                    type="secondary"
                    onClick={handlePrune}
                    disabled={pruning || selectedServer === "all"}
                />
                <Button
                    icon={refreshing ? mdiLoading : mdiRefresh}
                    text="Refresh"
                    type="secondary"
                    onClick={handleRefresh}
                    disabled={refreshing}
                />
            </div>

            <PaginatedTable
                data={paginatedImages}
                columns={columns}
                pagination={{
                    currentPage,
                    itemsPerPage: ITEMS_PER_PAGE,
                    total: filteredImages.length,
                }}
                onPageChange={setCurrentPage}
                getRowKey={(img, idx) => `${img.id}-${img.serverId}-${idx}`}
                loading={loading}
                emptyState={{
                    icon: mdiCubeOutline,
                    title: "No images found",
                    subtitle: images.length === 0
                        ? "No images have been discovered yet. Make sure you have active servers."
                        : "Try adjusting your search or filters",
                }}
            />

            <PullImageDialog
                open={pullDialogOpen}
                onClose={() => setPullDialogOpen(false)}
                servers={servers}
                onPullComplete={handlePullComplete}
            />
        </div>
    );
};
