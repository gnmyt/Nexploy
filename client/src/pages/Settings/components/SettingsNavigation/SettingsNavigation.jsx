import "./styles.sass";
import SettingsItem from "./components/SettingsItem";
import { useContext } from "react";
import { UserContext } from "@/common/contexts/UserContext.jsx";

export const SettingsNavigation = ({ userPages, adminPages }) => {
    const { user } = useContext(UserContext);

    return (
        <div className="settings-navigation">
            <p>User Settings</p>

            <div className="settings-group">
                {userPages.map((page, index) => (
                    <SettingsItem key={index} icon={page.icon} title={page.title} routeKey={page.routeKey} />
                ))}
            </div>

            {user?.role === "admin" && <p>Admin Settings</p>}
            {user?.role === "admin" && <div className="settings-group">
                {adminPages.map((page, index) => (
                    <SettingsItem key={index} icon={page.icon} title={page.title} routeKey={page.routeKey} />
                ))}
            </div>}
        </div>
    );
};