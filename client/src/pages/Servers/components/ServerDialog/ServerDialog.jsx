import { useState, useEffect } from "react";
import { DialogProvider } from "@/common/components/Dialog/Dialog.jsx";
import IconInput from "@/common/components/IconInput";
import ComboBox from "@/common/components/ComboBox";
import Button from "@/common/components/Button";
import WizardSteps from "@/common/components/WizardSteps";
import SelectBox from "@/common/components/SelectBox";
import { useToast } from "@/common/contexts/ToastContext.jsx";
import { getRequest, postRequest, patchRequest } from "@/common/utils/RequestUtil.js";
import { Icon } from "@mdi/react";
import { 
    mdiServer, 
    mdiMapMarker, 
    mdiIp, 
    mdiEthernet, 
    mdiAccount, 
    mdiLock, 
    mdiArrowRight,
    mdiArrowLeft,
    mdiFileUploadOutline
} from "@mdi/js";
import "./styles.sass";

const STEPS = [
    { key: "server", label: "Server", icon: mdiServer },
    { key: "user", label: "User", icon: mdiAccount }
];

export const ServerDialog = ({ open, onClose, onServerCreated, server = null }) => {
    const isEditMode = !!server;
    const { sendToast } = useToast();
    const [currentStep, setCurrentStep] = useState(0);
    const [name, setName] = useState("");
    const [location, setLocation] = useState("");
    const [existingLocations, setExistingLocations] = useState([]);
    const [host, setHost] = useState("");
    const [port, setPort] = useState("22");
    const [username, setUsername] = useState("");
    const [authMethod, setAuthMethod] = useState("password");
    const [password, setPassword] = useState("");
    const [sshKey, setSshKey] = useState("");
    const [sshKeyFileName, setSshKeyFileName] = useState("");
    const [passphrase, setPassphrase] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            getRequest("servers").then((servers) => {
                const locations = [...new Set(
                    servers.map((s) => s.location).filter(Boolean)
                )];
                setExistingLocations(locations);
            }).catch(() => {});

            if (server) {
                setName(server.name || "");
                setLocation(server.location || "");
                setHost(server.host || "");
                setPort(String(server.port || 22));
                setUsername(server.username || "");
                setAuthMethod(server.authMethod || "password");
            }
        }
    }, [open, server]);

    const authOptions = [
        { label: "Password", value: "password" },
        { label: "SSH Key", value: "ssh-key" }
    ];

    const readFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setSshKeyFileName(file.name);
        const reader = new FileReader();
        reader.onload = (event) => setSshKey(event.target.result);
        reader.readAsText(file);
    };

    const isStepValid = (step) => {
        if (step === 0) return name.trim() !== "" && host.trim() !== "" && port.trim() !== "";
        if (step === 1) {
            if (!username.trim()) return false;
            if (isEditMode) return true;
            if (authMethod === "password" && !password.trim()) return false;
            if (authMethod === "ssh-key" && !sshKey.trim()) return false;
            return true;
        }
        return false;
    };

    const handleNext = () => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (currentStep < STEPS.length - 1) {
            handleNext();
            return;
        }

        setLoading(true);

        try {
            let result;
            if (isEditMode) {
                const updateData = {
                    name,
                    location: location || null,
                    host,
                    port: parseInt(port, 10),
                    username,
                    authMethod,
                    ...(password ? (authMethod === "password" ? { password } : {}) : {}),
                    ...(sshKey ? (authMethod === "ssh-key" ? { sshKey, passphrase: passphrase || null } : {}) : {}),
                };
                result = await patchRequest(`servers/${server.id}`, updateData);
                sendToast("Success", "Server updated successfully");
            } else {
                const serverData = {
                    name,
                    location: location || null,
                    type: "ssh",
                    host,
                    port: parseInt(port, 10),
                    username,
                    authMethod,
                    ...(authMethod === "password" ? { password } : { sshKey, passphrase: passphrase || null })
                };
                result = await postRequest("servers", serverData);
                sendToast("Success", "Server added successfully");
            }
            
            if (onServerCreated) {
                onServerCreated(result);
            }
            
            handleClose();
        } catch (err) {
            sendToast("Error", err.message || (isEditMode ? "Failed to update server" : "Failed to add server"));
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setName("");
        setLocation("");
        setHost("");
        setPort("22");
        setUsername("");
        setPassword("");
        setSshKey("");
        setSshKeyFileName("");
        setPassphrase("");
        setCurrentStep(0);
        onClose();
    };

    const isLastStep = currentStep === STEPS.length - 1;

    return (
        <DialogProvider open={open} onClose={handleClose}>
            <div className="server-dialog">
                <div className="dialog-header">
                    <div className="dialog-icon">
                        <Icon path={mdiServer} />
                    </div>
                    <div className="dialog-title-section">
                        <h2>{isEditMode ? "Edit Server" : "Add Server"}</h2>
                        <p>{isEditMode ? "Update server configuration" : "Connect a new server to Nexploy"}</p>
                    </div>
                </div>

                <WizardSteps
                    steps={STEPS}
                    currentStep={currentStep}
                    onStepChange={setCurrentStep}
                />

                <form onSubmit={handleSubmit}>
                    <div className="dialog-content">
                        {currentStep === 0 && (
                            <div className="form-section">
                                <div className="form-group">
                                    <label htmlFor="name">Server Name</label>
                                    <IconInput
                                        type="text"
                                        id="name"
                                        icon={mdiServer}
                                        placeholder="Production Web Server"
                                        value={name}
                                        setValue={setName}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="location">Location</label>
                                    <ComboBox
                                        id="location"
                                        icon={mdiMapMarker}
                                        placeholder="New York, USA"
                                        value={location}
                                        setValue={setLocation}
                                        options={existingLocations}
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="host">Host</label>
                                        <IconInput
                                            type="text"
                                            id="host"
                                            icon={mdiIp}
                                            placeholder="192.168.1.100 or example.com"
                                            value={host}
                                            setValue={setHost}
                                            required
                                        />
                                    </div>
                                    <div className="form-group form-group-small">
                                        <label htmlFor="port">Port</label>
                                        <IconInput
                                            type="number"
                                            id="port"
                                            icon={mdiEthernet}
                                            placeholder="22"
                                            value={port}
                                            setValue={setPort}
                                            required
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentStep === 1 && (
                            <div className="form-section">
                                <div className="form-group">
                                    <label htmlFor="username">Username</label>
                                    <IconInput
                                        type="text"
                                        id="username"
                                        icon={mdiAccount}
                                        placeholder="root"
                                        value={username}
                                        setValue={setUsername}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Authentication Method</label>
                                    <SelectBox
                                        options={authOptions}
                                        selected={authMethod}
                                        setSelected={setAuthMethod}
                                    />
                                </div>

                                {authMethod === "password" ? (
                                    <div className="form-group">
                                        <label htmlFor="password">Password</label>
                                        <IconInput
                                            type="password"
                                            id="password"
                                            icon={mdiLock}
                                            placeholder={isEditMode ? "Leave empty to keep current" : "Enter password"}
                                            value={password}
                                            setValue={setPassword}
                                            required={!isEditMode}
                                        />
                                    </div>
                                ) : (
                                    <>
                                        <div className="form-group">
                                            <label htmlFor="ssh-key">SSH Private Key</label>
                                            <div className="file-upload-row">
                                                <Icon path={mdiFileUploadOutline} />
                                                <input
                                                    id="ssh-key"
                                                    type="file"
                                                    onChange={readFile}
                                                    required={!isEditMode && !sshKey}
                                                />
                                                {sshKeyFileName && <span className="file-name">{sshKeyFileName}</span>}
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="passphrase">Passphrase (optional)</label>
                                            <IconInput
                                                type="password"
                                                id="passphrase"
                                                icon={mdiLock}
                                                placeholder="Enter passphrase if encrypted"
                                                value={passphrase}
                                                setValue={setPassphrase}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="dialog-footer">
                        {currentStep > 0 ? (
                            <Button text="Back" type="secondary" icon={mdiArrowLeft} onClick={handleBack} buttonType="button" disabled={loading} />
                        ) : (
                            <Button text="Cancel" type="secondary" onClick={handleClose} buttonType="button" disabled={loading} />
                        )}
                        <Button 
                            text={isLastStep ? (loading ? "Saving..." : (isEditMode ? "Save" : "Add Server")) : "Next"}
                            icon={isLastStep ? undefined : mdiArrowRight}
                            buttonType="submit" 
                            disabled={loading || !isStepValid(currentStep)} 
                        />
                    </div>
                </form>
            </div>
        </DialogProvider>
    );
};
