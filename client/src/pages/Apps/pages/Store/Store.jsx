import "./styles.sass";
import AppCard from "../../components/AppCard";
import AppDetailDialog from "../../components/AppDetailDialog";
import { useState, useEffect, useCallback, useRef } from "react";
import IconInput from "@/common/components/IconInput";
import SelectBox from "@/common/components/SelectBox";
import { mdiMagnify, mdiLoading } from "@mdi/js";
import { Icon } from "@mdi/react";
import { getRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/ToastContext.jsx";

export const Store = () => {
    const [selectedApp, setSelectedApp] = useState(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [apps, setApps] = useState([]);
    const [categories, setCategories] = useState([{ label: "All Categories", value: "all" }]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const { sendToast } = useToast();
    const searchTimeout = useRef(null);

    const fetchApps = useCallback(async (p = 1, query = searchQuery, cat = selectedCategory) => {
        try {
            setLoading(true);
            const params = new URLSearchParams({ page: p, limit: 24 });
            if (query) params.set("search", query);
            if (cat && cat !== "all") params.set("category", cat);

            const result = await getRequest(`apps?${params}`);
            setApps(result.apps);
            setTotal(result.total);
            setPage(result.page);
            setTotalPages(result.totalPages);

            if (result.categories) {
                setCategories([
                    { label: "All Categories", value: "all" },
                    ...result.categories.map(c => ({ label: c, value: c })),
                ]);
            }
        } catch {
            sendToast("Error", "Failed to load apps");
        } finally {
            setLoading(false);
        }
    }, [searchQuery, selectedCategory, sendToast]);

    useEffect(() => {
        fetchApps(1);
    }, []);

    useEffect(() => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => {
            fetchApps(1, searchQuery, selectedCategory);
        }, 300);
        return () => clearTimeout(searchTimeout.current);
    }, [searchQuery, selectedCategory]);

    const handleViewDetails = (app) => {
        setSelectedApp(app);
        setDialogOpen(true);
    };

    const handleInstall = (app) => {
        console.log("Installing app:", app.name);
    };

    const handlePageChange = (newPage) => {
        fetchApps(newPage);
    };

    return (
        <>
            <div className="store-page">
                <div className="store-filters">
                    <div className="store-search">
                        <IconInput
                            type="text"
                            placeholder="Search apps..."
                            icon={mdiMagnify}
                            value={searchQuery}
                            setValue={setSearchQuery}
                        />
                    </div>
                    <div className="filter-group">
                        <SelectBox
                            options={categories}
                            selected={selectedCategory}
                            setSelected={setSelectedCategory}
                            searchable={categories.length > 5}
                        />
                    </div>
                </div>

                <div className="store-results">
                    <div className="results-header">
                        <h2>All Apps</h2>
                        <span className="results-count">{total} {total === 1 ? 'app' : 'apps'}</span>
                    </div>

                    {loading ? (
                        <div className="no-results">
                            <Icon path={mdiLoading} spin={true} size={2} />
                            <p>Loading apps...</p>
                        </div>
                    ) : apps.length > 0 ? (
                        <>
                            <div className="apps-grid">
                                {apps.map((app) => (
                                    <AppCard
                                        key={`${app.source}-${app.slug}`}
                                        app={app}
                                        variant="grid"
                                        onInstall={handleInstall}
                                        onViewDetails={handleViewDetails}
                                    />
                                ))}
                            </div>
                            {totalPages > 1 && (
                                <div className="pagination">
                                    <button disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>Previous</button>
                                    <span>Page {page} of {totalPages}</span>
                                    <button disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}>Next</button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="no-results">
                            <Icon path={mdiMagnify} />
                            <h3>No apps found</h3>
                            <p>Try adjusting your search or filters</p>
                        </div>
                    )}
                </div>
            </div>

            <AppDetailDialog 
                app={selectedApp} 
                open={dialogOpen} 
                onClose={() => setDialogOpen(false)}
                onInstall={handleInstall}
            />
        </>
    );
};
