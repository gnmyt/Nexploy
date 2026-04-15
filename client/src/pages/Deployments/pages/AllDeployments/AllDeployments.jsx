import "./styles.sass";
import { getRequest, postRequest, deleteRequest } from "@/common/utils/RequestUtil.js";
import DeploymentCard from "../../components/DeploymentCard";
import { useState, useMemo, useEffect, useCallback } from "react";
import IconInput from "@/common/components/IconInput";
import SelectBox from "@/common/components/SelectBox";
import { mdiMagnify, mdiLoading, mdiRocketLaunchOutline } from "@mdi/js";
import { Icon } from "@mdi/react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/common/contexts/ToastContext.jsx";

const STATUS_OPTIONS = [
    { label: "All Status", value: "all" },
    { label: "Deployed", value: "deployed" },
    { label: "Building", value: "building" },
    { label: "Pending", value: "pending" },
    { label: "Failed", value: "failed" },
];

export const AllDeployments = () => {
    const navigate = useNavigate();
    const { sendToast } = useToast();
    const [deployments, setDeployments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("all");

    const fetchDeployments = useCallback(async () => {
        try {
            setDeployments(await getRequest("deployments"));
        } catch {
            sendToast("Error", "Failed to load deployments");
        } finally {
            setLoading(false);
        }
    }, [sendToast]);

    useEffect(() => {
        fetchDeployments();
        const interval = setInterval(fetchDeployments, 10000);
        return () => clearInterval(interval);
    }, [fetchDeployments]);

    const filteredDeployments = useMemo(() => {
        let filtered = deployments;

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(d =>
                d.name.toLowerCase().includes(q) ||
                d.repoUrl?.toLowerCase().includes(q)
            );
        }

        if (selectedStatus !== "all") {
            filtered = filtered.filter(d => d.status === selectedStatus);
        }

        return filtered;
    }, [deployments, searchQuery, selectedStatus]);

    const handleBuild = async (id) => {
        try {
            await postRequest(`deployments/${id}/build`);
            sendToast("Success", "Build started");
            fetchDeployments();
        } catch (err) {
            sendToast("Error", err.message || "Failed to start build");
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteRequest(`deployments/${id}`);
            sendToast("Success", "Deployment deleted");
            fetchDeployments();
        } catch (err) {
            sendToast("Error", err.message || "Failed to delete deployment");
        }
    };

    if (loading) {
        return (
            <div className="all-deployments-page loading-state">
                <Icon path={mdiLoading} spin={true} size={2} />
                <p>Loading deployments...</p>
            </div>
        );
    }

    return (
        <div className="all-deployments-page">
            <div className="deployments-filters">
                <div className="deployments-search">
                    <IconInput
                        type="text"
                        placeholder="Search deployments..."
                        icon={mdiMagnify}
                        value={searchQuery}
                        setValue={setSearchQuery}
                    />
                </div>
                <div className="filter-group">
                    <SelectBox
                        options={STATUS_OPTIONS}
                        selected={selectedStatus}
                        setSelected={setSelectedStatus}
                    />
                </div>
            </div>

            <div className="deployments-results">
                {filteredDeployments.length > 0 ? (
                    <div className="deployments-grid">
                        {filteredDeployments.map((deployment) => (
                            <DeploymentCard
                                key={deployment.id}
                                deployment={deployment}
                                onClick={(d) => navigate(`/deployments/edit/${d.id}`)}
                                onBuild={handleBuild}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="no-results">
                        <Icon path={mdiRocketLaunchOutline} />
                        <h3>No deployments found</h3>
                        <p>{deployments.length === 0 ? "Create your first deployment to get started." : "Try adjusting your search or filters"}</p>
                    </div>
                )}
            </div>
        </div>
    );
};
