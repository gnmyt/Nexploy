import "./styles.sass";
import Icon from "@mdi/react";
import { useEffect, useRef, useState } from "react";

export const TabSwitcher = ({ tabs, activeTab, onTabChange, variant = "default", iconOnly = false }) => {
    const tabRefs = useRef({});
    const [indicatorStyle, setIndicatorStyle] = useState({});

    useEffect(() => {
        if (activeTab && tabRefs.current[activeTab]) {
            const tab = tabRefs.current[activeTab];
            setIndicatorStyle({
                width: tab.offsetWidth,
                left: tab.offsetLeft,
            });
        }
    }, [activeTab]);

    return (
        <div className={`tab-switcher tab-switcher-${variant}${iconOnly ? ' tab-switcher-icon-only' : ''}`}>
            <div className="tab-switcher-container">
                <div 
                    className="tab-switcher-indicator" 
                    style={indicatorStyle}
                />
                {tabs.map((tab) => (
                    <div 
                        key={tab.key}
                        ref={el => tabRefs.current[tab.key] = el}
                        className={`tab-switcher-tab${activeTab === tab.key ? ' active' : ''}`}
                        onClick={() => onTabChange(tab.key)}
                    >
                        {tab.icon && <Icon path={tab.icon} />}
                        {!iconOnly && <span>{tab.label}</span>}
                    </div>
                ))}
            </div>
        </div>
    );
};
