import "./styles.sass";
import { useEffect, useState, useCallback } from "react";
import { getRequest, postRequest, patchRequest, deleteRequest } from "@/common/utils/RequestUtil.js";
import Button from "@/common/components/Button";
import { DialogProvider } from "@/common/components/Dialog";
import ToggleSwitch from "@/common/components/ToggleSwitch";
import { useToast } from "@/common/contexts/ToastContext.jsx";
import ActionConfirmDialog from "@/common/components/ActionConfirmDialog";
import IconInput from "@/common/components/IconInput";
import { Icon } from "@mdi/react";
import {
    mdiPlus,
    mdiSync,
    mdiPencil,
    mdiTrashCan,
    mdiCloudDownload,
    mdiPackageVariant,
    mdiCheck,
    mdiClose,
    mdiLoading,
    mdiFormTextbox,
    mdiLink,
} from "@mdi/js";

export const Sources = () => {
    const [sources, setSources] = useState([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editSource, setEditSource] = useState(null);
    const [formData, setFormData] = useState({ name: "", url: "", enabled: true });
    const [validating, setValidating] = useState(false);
    const [validationResult, setValidationResult] = useState(null);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState({});
    const [deleteConfirmDialog, setDeleteConfirmDialog] = useState({ open: false, source: null });
    const { sendToast } = useToast();

    const loadSources = useCallback(async () => {
        try {
            const data = await getRequest("sources");
            setSources(data);
        } catch {
            sendToast("Error", "Failed to load sources");
        }
    }, [sendToast]);

    useEffect(() => {
        loadSources();
    }, [loadSources]);

    const openCreateDialog = () => {
        setEditSource(null);
        setFormData({ name: "", url: "", enabled: true });
        setValidationResult(null);
        setDialogOpen(true);
    };

    const openEditDialog = (source) => {
        setEditSource(source);
        setFormData({ name: source.name, url: source.url, enabled: source.enabled });
        setValidationResult(null);
        setDialogOpen(true);
    };

    const closeDialog = () => {
        setDialogOpen(false);
        setEditSource(null);
        setFormData({ name: "", url: "", enabled: true });
        setValidationResult(null);
    };

    const validateUrl = async () => {
        if (!formData.url) return;

        setValidating(true);
        setValidationResult(null);

        try {
            const result = await postRequest("sources/validate", { url: formData.url });
            setValidationResult(result);
        } catch (error) {
            setValidationResult({
                valid: false,
                error: error.message || "Validation failed",
            });
        } finally {
            setValidating(false);
        }
    };

    const handleSubmit = async () => {
        if (!formData.url) {
            sendToast("Error", "URL is required");
            return;
        }

        setSaving(true);

        try {
            if (editSource) {
                await patchRequest(`sources/${editSource.name}`, formData);
                sendToast("Success", "Source updated");
            } else {
                await postRequest("sources", { url: formData.url });
                sendToast("Success", "Source created");
            }
            closeDialog();
            loadSources();
        } catch (error) {
            sendToast("Error", error.message || "Failed to save source");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteRequest = (source) => {
        setDeleteConfirmDialog({ open: true, source });
    };

    const handleDeleteConfirm = async () => {
        const source = deleteConfirmDialog.source;
        try {
            await deleteRequest(`sources/${source.name}`);
            sendToast("Success", "Source deleted");
            loadSources();
        } catch (error) {
            sendToast("Error", error.message || "Failed to delete source");
        }
        setDeleteConfirmDialog({ open: false, source: null });
    };

    const handleSync = async (sourceName) => {
        setSyncing(prev => ({ ...prev, [sourceName]: true }));

        try {
            await postRequest(`sources/${sourceName}/sync`);
            sendToast("Success", "Source sync started");
        } catch (error) {
            sendToast("Error", error.message || "Failed to sync source");
        } finally {
            setSyncing(prev => ({ ...prev, [sourceName]: false }));
            loadSources();
        }
    };

    const getStatusClass = (source) => {
        if (!source.enabled) return "disabled";
        if (!source.lastSyncStatus) return "pending";
        return source.lastSyncStatus;
    };

    const getStatusLabel = (source) => {
        if (!source.enabled) return "Disabled";
        if (!source.lastSyncStatus) return "Pending";
        if (source.lastSyncStatus === "success") return "Synced";
        return "Error";
    };

    return (
        <div className="sources-page">
            <div className="sources-section">
                <div className="section-header">
                    <div className="header-content">
                        <h2>Sources</h2>
                        <p>Manage app store sources for discovering and installing applications</p>
                    </div>
                    <Button text="Add Source" icon={mdiPlus} onClick={openCreateDialog} />
                </div>

                <div className="sources-grid">
                    {sources.length === 0 ? (
                        <div className="no-sources">
                            <Icon path={mdiCloudDownload} />
                            <h2>No sources configured</h2>
                            <p>Add a source to start discovering applications</p>
                        </div>
                    ) : (
                        sources.map(source => (
                            <div key={source.name} className={`source-card ${!source.enabled ? "disabled" : ""}`}>
                                <div className="source-info">
                                    <Icon path={mdiCloudDownload} className="source-icon" />
                                    <div className="source-details">
                                        <div className="source-header">
                                            <h3>{source.name}</h3>
                                            <span className={`source-status ${getStatusClass(source)}`}>
                                                {getStatusLabel(source)}
                                            </span>
                                        </div>
                                        <p className="source-url">{source.url}</p>
                                        <div className="source-meta">
                                            <span className="meta-item">
                                                <Icon path={mdiPackageVariant} />
                                                {source.appCount} apps
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="source-actions">
                                    <button
                                        className="action-btn sync-btn"
                                        onClick={() => handleSync(source.name)}
                                        disabled={syncing[source.name] || !source.enabled}
                                        title="Sync"
                                    >
                                        <Icon path={syncing[source.name] ? mdiLoading : mdiSync}
                                              spin={syncing[source.name] ? 1 : 0} />
                                    </button>
                                    {!source.isDefault && (
                                        <button
                                            className="action-btn edit-btn"
                                            onClick={() => openEditDialog(source)}
                                            title="Edit"
                                        >
                                            <Icon path={mdiPencil} />
                                        </button>
                                    )}
                                    {!source.isDefault && (
                                        <button
                                            className="action-btn delete-btn"
                                            onClick={() => handleDeleteRequest(source)}
                                            title="Delete"
                                        >
                                            <Icon path={mdiTrashCan} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <DialogProvider open={dialogOpen} onClose={closeDialog}>
                <div className="source-dialog">
                    <h2>{editSource ? "Edit Source" : "Add Source"}</h2>

                    {editSource ? (
                        <div className="form-group">
                            <label>Name</label>
                            <IconInput
                                type="text"
                                icon={mdiFormTextbox}
                                value={formData.name}
                                disabled
                            />
                        </div>
                    ) : null}

                    <div className="form-group">
                        <label>URL</label>
                        <IconInput
                            type="text"
                            icon={mdiLink}
                            value={formData.url}
                            setValue={(value) => {
                                setFormData({ ...formData, url: value });
                                setValidationResult(null);
                            }}
                            onBlur={validateUrl}
                            placeholder="https://example.com/store"
                        />
                    </div>

                    {validating && (
                        <div className="validation-result loading">
                            <Icon path={mdiLoading} spin={1} />
                            Validating source...
                        </div>
                    )}

                    {validationResult && !validating && (
                        <div className={`validation-result ${validationResult.valid ? "success" : "error"}`}>
                            <Icon path={validationResult.valid ? mdiCheck : mdiClose} />
                            {validationResult.valid
                                ? `Valid source: "${validationResult.name}" with ${validationResult.appCount} apps`
                                : validationResult.error}
                        </div>
                    )}

                    {editSource && (
                        <div className="toggle-row">
                            <div className="toggle-label">
                                <h4>Enabled</h4>
                                <p>Enable or disable this source</p>
                            </div>
                            <ToggleSwitch
                                checked={formData.enabled}
                                onChange={(checked) => setFormData({ ...formData, enabled: checked })}
                                id="source-enabled"
                            />
                        </div>
                    )}

                    <div className="dialog-actions">
                        <Button text="Cancel" onClick={closeDialog} type="secondary" />
                        <Button
                            text={editSource ? "Save" : "Add Source"}
                            onClick={handleSubmit}
                            type="primary"
                            disabled={saving || !formData.url}
                        />
                    </div>
                </div>
            </DialogProvider>

            <ActionConfirmDialog
                open={deleteConfirmDialog.open}
                setOpen={(open) => setDeleteConfirmDialog(prev => ({ ...prev, open }))}
                onConfirm={handleDeleteConfirm}
                text={`Are you sure you want to delete the source "${deleteConfirmDialog.source?.name}"?`}
            />
        </div>
    );
};
