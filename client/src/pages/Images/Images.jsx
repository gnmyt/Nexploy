import "./styles.sass";
import { Icon } from "@mdi/react";
import { mdiCubeOutline } from "@mdi/js";
import AllImages from "./pages/AllImages";

export const Images = () => {
    return (
        <div className="images-page">
            <div className="images-header">
                <div className="header-content">
                    <div className="header-icon">
                        <Icon path={mdiCubeOutline} />
                    </div>
                    <div className="header-text">
                        <h1>Images</h1>
                        <p>Manage your Docker images</p>
                    </div>
                </div>
            </div>

            <div className="images-content has-padding">
                <AllImages />
            </div>
        </div>
    );
};
