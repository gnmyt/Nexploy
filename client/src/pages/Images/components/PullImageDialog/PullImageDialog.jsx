import "./styles.sass";
import { DialogProvider } from "@/common/components/Dialog/Dialog.jsx";
import { useState } from "react";
import { postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/ToastContext.jsx";
import { Button } from "@/common/components/Button/Button.jsx";
import { SelectBox } from "@/common/components/SelectBox/SelectBox.jsx";
import { IconInput } from "@/common/components/IconInput/IconInput.jsx";
import { Icon } from "@mdi/react";
import { mdiDownload, mdiLoading, mdiCubeOutline } from "@mdi/js";

export const PullImageDialog = ({ open, onClose, servers, onPullComplete }) => {
    const { sendToast } = useToast();
    const [imageName, setImageName] = useState("");
    const [selectedServer, setSelectedServer] = useState("");
    const [pulling, setPulling] = useState(false);

    const serverOptions = servers
        .filter(s => s.status === "active")
        .map(s => ({ label: s.name, value: String(s.id) }));

    const handleClose = () => {
        if (!pulling) {
            setImageName("");
            setSelectedServer("");
            onClose();
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedServer || !imageName.trim()) return;

        setPulling(true);
        try {
            const result = await postRequest("images/pull", {
                serverId: Number.parseInt(selectedServer, 10),
                image: imageName.trim(),
            });
            sendToast("Success", result.message || `Pulled ${imageName}`);
            onPullComplete?.();
            handleClose();
        } catch (err) {
            sendToast("Error", err.message || "Failed to pull image");
        } finally {
            setPulling(false);
        }
    };

    return (
        <DialogProvider open={open} onClose={handleClose} disableClosing={pulling}>
            <div className="pull-image-dialog">
                <div className="dialog-header">
                    <div className="dialog-header-icon">
                        <Icon path={mdiDownload} />
                    </div>
                    <div>
                        <h2>Pull Image</h2>
                        <p>Pull a Docker image to a server</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="dialog-content">
                        <div className="form-group">
                            <label>Server</label>
                            <SelectBox
                                options={serverOptions}
                                selected={selectedServer}
                                setSelected={setSelectedServer}
                            />
                        </div>
                        <div className="form-group">
                            <label>Image</label>
                            <IconInput
                                type="text"
                                placeholder="e.g. nginx:latest, ubuntu:22.04"
                                icon={mdiCubeOutline}
                                value={imageName}
                                setValue={setImageName}
                            />
                        </div>
                    </div>

                    <div className="dialog-footer">
                        <Button
                            text="Cancel"
                            type="secondary"
                            onClick={handleClose}
                            disabled={pulling}
                        />
                        <Button
                            text={pulling ? "Pulling..." : "Pull Image"}
                            icon={pulling ? mdiLoading : mdiDownload}
                            buttonType="submit"
                            disabled={pulling || !selectedServer || !imageName.trim()}
                        />
                    </div>
                </form>
            </div>
        </DialogProvider>
    );
};
