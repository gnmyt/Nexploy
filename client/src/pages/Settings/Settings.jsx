import "./styles.sass";
import Icon from "@mdi/react";
import { mdiAccountCircleOutline, mdiAccountGroup, mdiClockStarFourPointsOutline, mdiShieldAccountOutline, mdiDomain, mdiCreationOutline, mdiKeyVariant, mdiConsole, mdiKeyboardOutline } from "@mdi/js";
import SettingsNavigation from "./components/SettingsNavigation";
import { Navigate, useLocation } from "react-router-dom";
import Account from "@/pages/Settings/pages/Account";
import Sessions from "@/pages/Settings/pages/Sessions";
import Users from "@/pages/Settings/pages/Users";

export const Settings = () => {
    const location = useLocation();

    const userPages = [
        { title: "Account", routeKey: "account", icon: mdiAccountCircleOutline, content: <Account /> },
        { title: "Sessions", routeKey: "sessions", icon: mdiClockStarFourPointsOutline, content: <Sessions /> },
    ];

    const adminPages = [
        { title: "Users", routeKey: "users", icon: mdiAccountGroup, content: <Users /> },
    ];

    const currentPage = [...userPages, ...adminPages].find(page => location.pathname.endsWith(page.routeKey));

    if (!currentPage) return <Navigate to="/settings/account" />;
    
    return (
        <div className="settings-page">
            <SettingsNavigation userPages={userPages} adminPages={adminPages} />
            <div className="settings-content">
                <div className="settings-header">
                    <Icon path={currentPage.icon} />
                    <h1>{currentPage.title}</h1>
                </div>
                <hr/>

                <div className="settings-content-inner">
                    {currentPage.content}
                </div>
            </div>
        </div>
    )
}