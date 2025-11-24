import "./styles.sass";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "@/common/contexts/UserContext.jsx";
import { getRequest, deleteRequest, patchRequest, postRequest } from "@/common/utils/RequestUtil.js";
import Button from "@/common/components/Button";
import Icon from "@mdi/react";
import {
    mdiAccount,
    mdiDotsVertical,
    mdiLock,
    mdiShieldAccount,
    mdiKey,
    mdiSecurity,
    mdiAccountRemove,
    mdiLogin,
} from "@mdi/js";
import CreateUserDialog from "./components/CreateUserDialog";
import { ContextMenu, ContextMenuItem, useContextMenu } from "@/common/components/ContextMenu";
import { ActionConfirmDialog } from "@/common/components/ActionConfirmDialog/ActionConfirmDialog.jsx";
import PasswordChange from "@/pages/Settings/pages/Account/dialogs/PasswordChange";
import { useNavigate } from "react-router-dom";

export const Users = () => {
    const [users, setUsers] = useState([]);
    const { user, overrideToken } = useContext(UserContext);
    const navigate = useNavigate();

    const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
    const [contextUserId, setContextUserId] = useState(null);
    const [passwordChangeDialogOpen, setPasswordChangeDialogOpen] = useState(false);
    const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
    const [demoteDialogOpen, setDemoteDialogOpen] = useState(false);
    const [confirmDeleteDialogOpen, setConfirmDeleteDialogOpen] = useState(false);

    const contextMenu = useContextMenu();

    const loadUsers = () => {
        getRequest("users/list").then(response => {
            setUsers([...response]);
        });
    };

    const openContextMenu = (e, userId) => {
        e.preventDefault();
        e.stopPropagation();
        setContextUserId(userId);
        contextMenu.open(e);
    };

    const deleteUser = (userId) => {
        deleteRequest(`users/${userId}`).then(() => {
            loadUsers();
        });
    };

    const updateRole = (userId, role) => {
        patchRequest(`users/${userId}/role`, { role: role }).then(() => {
            loadUsers();
        });
    };

    const loginAsUser = (userId) => {
        postRequest(`users/${userId}/login`).then(response => {
            overrideToken(response.token);
            navigate("/servers");
        });
    };

    useEffect(() => {
        loadUsers();
    }, [user]);

    return (
        <div className="users-page">
            <CreateUserDialog open={createUserDialogOpen} onClose={() => setCreateUserDialogOpen(false)}
                              loadUsers={loadUsers} />

            <ActionConfirmDialog open={confirmDeleteDialogOpen} setOpen={setConfirmDeleteDialogOpen}
                                 onConfirm={() => deleteUser(contextUserId)}
                                 text="Are you sure you want to delete this user?" />
            <ActionConfirmDialog open={promoteDialogOpen} setOpen={setPromoteDialogOpen}
                                 onConfirm={() => updateRole(contextUserId, "admin")}
                                 text="Are you sure you want to promote this user to admin?" />
            <ActionConfirmDialog open={demoteDialogOpen} setOpen={setDemoteDialogOpen}
                                 onConfirm={() => updateRole(contextUserId, "user")}
                                 text="Are you sure you want to demote this user?" />

            <PasswordChange open={passwordChangeDialogOpen} onClose={() => setPasswordChangeDialogOpen(false)}
                            accountId={contextUserId} />

            <div className="users-header">
                <h2>Users ({users.length})</h2>
                <Button onClick={() => setCreateUserDialogOpen(true)} text="Create New User" />
            </div>

            {users.map(currentUser => (
                <div 
                    key={currentUser.id} 
                    className="user-item"
                    onContextMenu={(e) => openContextMenu(e, currentUser.id)}
                >
                    <div className="user-info">
                        <div className={"icon-container" + (currentUser.role === "admin" ? " icon-admin" : "")}>
                            <Icon path={currentUser.role === "admin" ? mdiShieldAccount : mdiAccount} />
                        </div>
                        <div className="user-details">
                            <h2>{currentUser.firstName} {currentUser.lastName}</h2>
                            <p>@{currentUser.username}</p>
                        </div>
                    </div>
                    <div className="user-actions">
                        <div className={"user-security" + (currentUser.totpEnabled ? " security-enabled" : "")}>
                            <Icon path={mdiLock} />
                            <span>{currentUser.totpEnabled ? "2FA Enabled" : "2FA Disabled"}</span>
                        </div>
                        <Icon path={mdiDotsVertical} className="menu-icon" onClick={(e) => openContextMenu(e, currentUser.id)} />
                    </div>
                </div>
            ))}

            <ContextMenu
                isOpen={contextMenu.isOpen}
                position={contextMenu.position}
                onClose={contextMenu.close}
                trigger={contextMenu.triggerRef}
            >
                <ContextMenuItem
                    icon={mdiKey}
                    label="Change Password"
                    onClick={() => setPasswordChangeDialogOpen(true)}
                />

                {users.find(u => u.id === contextUserId)?.role === "user" && user.id !== contextUserId && (
                    <ContextMenuItem
                        icon={mdiSecurity}
                        label="Promote to Admin"
                        onClick={() => setPromoteDialogOpen(true)}
                    />
                )}

                {users.find(u => u.id === contextUserId)?.role === "admin" && user.id !== contextUserId && (
                    <ContextMenuItem
                        icon={mdiAccount}
                        label="Demote to User"
                        onClick={() => setDemoteDialogOpen(true)}
                    />
                )}

                {user.id !== contextUserId && (
                    <>
                        <ContextMenuItem
                            icon={mdiAccountRemove}
                            label="Delete User"
                            onClick={() => setConfirmDeleteDialogOpen(true)}
                            danger
                        />
                        <ContextMenuItem
                            icon={mdiLogin}
                            label="Login as User"
                            onClick={() => loginAsUser(contextUserId)}
                        />
                    </>
                )}
            </ContextMenu>
        </div>
    );
};
