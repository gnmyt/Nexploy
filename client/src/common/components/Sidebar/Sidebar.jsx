import "./styles.sass";
import {
    mdiCog,
    mdiLogout,
    mdiPackageVariant,
    mdiServerOutline,
    mdiCodeBrackets,
    mdiChartBoxOutline,
    mdiShieldCheckOutline,
} from "@mdi/js";
import Icon from "@mdi/react";
import {useLocation, useNavigate} from "react-router-dom";
import {useContext, useState} from "react";
import {UserContext} from "@/common/contexts/UserContext.jsx";
import {ActionConfirmDialog} from "@/common/components/ActionConfirmDialog/ActionConfirmDialog.jsx";
import Tooltip from "@/common/components/Tooltip";

export const Sidebar = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
    const [logoClicked, setLogoClicked] = useState(false);

    const {logout, user} = useContext(UserContext);

    const navigation = [
        {title: "Settings", path: "/settings", icon: mdiCog}
    ];

    const isActive = (path) => {
        return location.pathname.startsWith(path);
    };

    const handleLogoClick = () => {
        setLogoClicked(true);
        setTimeout(() => setLogoClicked(false), 800);
        navigate("/");
    };

    return (
        <>
            <div className="sidebar">
                <ActionConfirmDialog open={logoutDialogOpen} setOpen={setLogoutDialogOpen}
                                     text={`Are you sure you want to log out, ${user?.username}?`}
                                     onConfirm={logout}/>
                <div className="sidebar-top">
                    <Tooltip text="Nexploy">
                        <div className={`sidebar-logo ${logoClicked ? "clicked" : ""}`} onClick={handleLogoClick}>
                            <svg width="271" height="298" viewBox="0 0 271 298" fill="none"
                                 xmlns="http://www.w3.org/2000/svg">
                                <g className="hex-layer-1">
                                    <path
                                        d="M135.5 7.5L263.5 78.2368V219.711L135.5 290.447L7.5 219.711V78.2368L135.5 7.5Z"
                                        stroke="url(#paint0_linear_249_13)" strokeWidth="15" strokeLinejoin="round"/>
                                </g>
                                <g className="hex-layer-2">
                                    <path opacity="0.4"
                                          d="M135.816 54.5L230.132 108.395V189.237L135.816 243.132L41.5 189.237V108.395L135.816 54.5Z"
                                          fill="url(#paint1_linear_249_13)"/>
                                </g>
                                <g className="hex-layer-3">
                                    <path opacity="0.6"
                                          d="M135.815 88.1841L209.92 131.974V179.131L135.815 222.921L61.71 179.131V131.974L135.815 88.1841Z"
                                          fill="url(#paint2_linear_249_13)"/>
                                </g>
                                <g className="hex-layer-4">
                                    <path
                                        d="M135.816 121.868L189.71 152.184V185.868L135.816 216.184L81.9209 185.868V152.184L135.816 121.868Z"
                                        fill="url(#paint3_linear_249_13)"/>
                                </g>
                                <defs>
                                    <linearGradient id="paint0_linear_249_13" x1="135.5" y1="27.7105" x2="135.5"
                                                    y2="270.237"
                                                    gradientUnits="userSpaceOnUse">
                                        <stop stopColor="#9333EA"/>
                                        <stop offset="1" stopColor="#7C3AED"/>
                                    </linearGradient>
                                    <linearGradient id="paint1_linear_249_13" x1="135.816" y1="88.1842" x2="135.816"
                                                    y2="199.342"
                                                    gradientUnits="userSpaceOnUse">
                                        <stop stopColor="#9333EA"/>
                                        <stop offset="1" stopColor="#7C3AED"/>
                                    </linearGradient>
                                    <linearGradient id="paint2_linear_249_13" x1="135.815" y1="115.131" x2="135.815"
                                                    y2="195.974"
                                                    gradientUnits="userSpaceOnUse">
                                        <stop stopColor="#A855F7"/>
                                        <stop offset="1" stopColor="#9333EA"/>
                                    </linearGradient>
                                    <linearGradient id="paint3_linear_249_13" x1="135.816" y1="142.079" x2="135.816"
                                                    y2="195.974"
                                                    gradientUnits="userSpaceOnUse">
                                        <stop stopColor="#C084FC"/>
                                        <stop offset="1" stopColor="#A855F7"/>
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    </Tooltip>
                    <hr/>
                    <nav>
                        {navigation.map((item, index) => {
                            return (
                                <Tooltip key={index} text={item.title}>
                                    <div onClick={() => navigate(item.path)}
                                         className={"nav-item" + (isActive(item.path) ? " nav-item-active" : "")}>
                                        <Icon path={item.icon}/>
                                    </div>
                                </Tooltip>
                            );
                        })}
                    </nav>
                </div>

                <div className="log-out-area">
                    <Tooltip text={"Log out"}>
                        <div className="log-out-btn" onClick={() => setLogoutDialogOpen(true)}>
                            <Icon path={mdiLogout}/>
                        </div>
                    </Tooltip>
                </div>
            </div>
        </>
    );
};