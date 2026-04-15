import "./styles.sass";
import {
    mdiCog,
    mdiLogout,
    mdiPackageVariant,
    mdiServerOutline,
    mdiLayers,
    mdiDocker,
    mdiCubeOutline,
    mdiAccountCogOutline,
} from "@mdi/js";
import { Icon } from "@mdi/react";
import { useLocation, useNavigate } from "react-router-dom";
import { useContext, useState, useRef, useEffect } from "react";
import { UserContext } from "@/common/contexts/UserContext.jsx";
import { ActionConfirmDialog } from "@/common/components/ActionConfirmDialog/ActionConfirmDialog.jsx";
import Tooltip from "@/common/components/Tooltip";
import { SettingsDialog } from "@/common/components/SettingsDialog/SettingsDialog.jsx";

export const Sidebar = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
    const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [logoClicked, setLogoClicked] = useState(false);
    const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });

    const logoRef = useRef(null);
    const hoverTimeoutRef = useRef(null);

    const { logout, user } = useContext(UserContext);

    const navigation = [
        { title: "Servers", path: "/servers", icon: mdiServerOutline },
        { title: "Containers", path: "/containers", icon: mdiDocker },
        { title: "Images", path: "/images", icon: mdiCubeOutline },
        { title: "Stacks", path: "/stacks", icon: mdiLayers },
        { title: "Apps", path: "/apps", icon: mdiPackageVariant }
    ];

    const isActive = (path) => {
        return location.pathname.startsWith(path);
    };

    const getUserInitials = () => {
        if (user?.firstName && user?.lastName) {
            return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
        }
        return user?.username?.slice(0, 2).toUpperCase() || "??";
    };

    const handleMouseEnter = () => {
        clearTimeout(hoverTimeoutRef.current);
        setUserMenuOpen(true);
    };

    const handleMouseLeave = () => {
        hoverTimeoutRef.current = setTimeout(() => setUserMenuOpen(false), 150);
    };

    useEffect(() => () => clearTimeout(hoverTimeoutRef.current), []);

    const handleLogoClick = () => {
        setLogoClicked(true);
        setTimeout(() => setLogoClicked(false), 800);
        navigate("/");
    };

    const handleMouseMove = (e) => {
        if (!logoRef.current) return;

        const rect = logoRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const relativeX = (e.clientX - centerX) / (rect.width / 2);
        const relativeY = (e.clientY - centerY) / (rect.height / 2);

        setMouseOffset({ x: -relativeX * 1.5, y: -relativeY * 1.5 });
    };
    const handleLogoMouseLeave = () => {
        setMouseOffset({ x: 0, y: 0 });
    };

    return (
        <>
            <div className="sidebar">
                <ActionConfirmDialog open={logoutDialogOpen} setOpen={setLogoutDialogOpen}
                                     text={`Are you sure you want to log out, ${user?.username}?`}
                                     onConfirm={logout} />
                <div className="sidebar-top">
                    <Tooltip text="Nexploy">
                        <div
                            ref={logoRef}
                            className={`sidebar-logo ${logoClicked ? "clicked" : ""}`}
                            onClick={handleLogoClick}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleLogoMouseLeave}
                        >
                            <svg width="271" height="298" viewBox="0 0 271 298" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <g className="hex-layer-1" style={{
                                    transform: `translate(${mouseOffset.x * 6}px, ${mouseOffset.y * 6}px)`,
                                    transition: 'transform 0.15s ease-out'
                                }}>
                                    <path d="M135.5 7.5L263.5 78.2368V219.711L135.5 290.447L7.5 219.711V78.2368L135.5 7.5Z"
                                          stroke="url(#paint0_linear_249_13)" strokeWidth="15" strokeLinejoin="round"/>
                                </g>
                                <g className="hex-layer-2" style={{
                                    transform: `translate(${mouseOffset.x * 10}px, ${mouseOffset.y * 10}px)`,
                                    transition: 'transform 0.15s ease-out'
                                }}>
                                    <path opacity="0.4" d="M135.816 54.5L230.132 108.395V189.237L135.816 243.132L41.5 189.237V108.395L135.816 54.5Z"
                                          fill="url(#paint1_linear_249_13)"/>
                                </g>
                                <g className="hex-layer-3" style={{
                                    transform: `translate(${mouseOffset.x * 14}px, ${mouseOffset.y * 14}px)`,
                                    transition: 'transform 0.15s ease-out'
                                }}>
                                    <path opacity="0.6"
                                          d="M135.815 88.1841L209.92 131.974V179.131L135.815 222.921L61.71 179.131V131.974L135.815 88.1841Z"
                                          fill="url(#paint2_linear_249_13)"/>
                                </g>
                                <g className="hex-layer-4" style={{
                                    transform: `translate(${mouseOffset.x * 18}px, ${mouseOffset.y * 18}px)`,
                                    transition: 'transform 0.15s ease-out'
                                }}>
                                    <path d="M135.816 121.868L189.71 152.184V185.868L135.816 216.184L81.9209 185.868V152.184L135.816 121.868Z"
                                          fill="url(#paint3_linear_249_13)"/>
                                </g>
                                <defs>
                                    <linearGradient id="paint0_linear_249_13" x1="135.5" y1="27.7105" x2="135.5" y2="270.237"
                                                    gradientUnits="userSpaceOnUse">
                                        <stop stopColor="#9333EA"/>
                                        <stop offset="1" stopColor="#7C3AED"/>
                                    </linearGradient>
                                    <linearGradient id="paint1_linear_249_13" x1="135.816" y1="88.1842" x2="135.816" y2="199.342"
                                                    gradientUnits="userSpaceOnUse">
                                        <stop stopColor="#9333EA"/>
                                        <stop offset="1" stopColor="#7C3AED"/>
                                    </linearGradient>
                                    <linearGradient id="paint2_linear_249_13" x1="135.815" y1="115.131" x2="135.815" y2="195.974"
                                                    gradientUnits="userSpaceOnUse">
                                        <stop stopColor="#A855F7"/>
                                        <stop offset="1" stopColor="#9333EA"/>
                                    </linearGradient>
                                    <linearGradient id="paint3_linear_249_13" x1="135.816" y1="142.079" x2="135.816" y2="195.974"
                                                    gradientUnits="userSpaceOnUse">
                                        <stop stopColor="#C084FC"/>
                                        <stop offset="1" stopColor="#A855F7"/>
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    </Tooltip>
                    <nav>
                        {navigation.map((item, index) => {
                            return (
                                <Tooltip key={index} text={item.title}>
                                    <div onClick={() => navigate(item.path)}
                                         className={"nav-item" + (isActive(item.path) ? " nav-item-active" : "")}>
                                        <Icon path={item.icon} />
                                    </div>
                                </Tooltip>
                            );
                        })}
                    </nav>
                </div>

                <div className="sidebar-bottom">
                    <div className="user-account-area" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                        <Tooltip text={user?.username || "Account"} disabled={userMenuOpen}>
                            <div className={`user-btn ${userMenuOpen ? 'active' : ''}`}>
                                <Icon path={mdiAccountCogOutline} />
                            </div>
                        </Tooltip>
                        <div className={`user-menu ${userMenuOpen ? 'open' : ''}`}>
                            <div className="user-menu-header">
                                <div className="user-avatar">
                                    <span>{getUserInitials()}</span>
                                </div>
                                <div className="user-info">
                                    <span className="user-name">
                                        {user?.firstName && user?.lastName
                                            ? `${user.firstName} ${user.lastName}`
                                            : user?.username || "Account"}
                                    </span>
                                    <span className="user-username">@{user?.username}</span>
                                </div>
                            </div>
                            <div className="user-menu-separator" />
                            <div className={`user-menu-item ${settingsDialogOpen ? 'active' : ''}`}
                                 onClick={() => { setSettingsDialogOpen(true); setUserMenuOpen(false); }}>
                                <Icon path={mdiCog} className="menu-icon" />
                                <span className="menu-label">Settings</span>
                            </div>
                            <div className="user-menu-separator" />
                            <div className="user-menu-item danger"
                                 onClick={() => { setLogoutDialogOpen(true); setUserMenuOpen(false); }}>
                                <Icon path={mdiLogout} className="menu-icon" />
                                <span className="menu-label">Logout</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <SettingsDialog open={settingsDialogOpen} onClose={() => setSettingsDialogOpen(false)} />
        </>
    );
};