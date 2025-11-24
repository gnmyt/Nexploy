import IconInput from "@/common/components/IconInput";
import "./styles.sass";
import { mdiAccountCircleOutline, mdiWhiteBalanceSunny, mdiAccountEdit, mdiPalette, mdiShieldCheck, mdiLockReset, mdiTranslate, mdiSync, mdiCloudSync, mdiWeb, mdiTabUnselected, mdiThemeLightDark, mdiWeatherNight, mdiMagicStaff } from "@mdi/js";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "@/common/contexts/UserContext.jsx";
import { useTheme } from "@/common/contexts/ThemeContext.jsx";
import Button from "@/common/components/Button";
import { patchRequest, postRequest } from "@/common/utils/RequestUtil.js";
import TwoFactorAuthentication from "@/pages/Settings/pages/Account/dialogs/TwoFactorAuthentication";
import PasswordChange from "@/pages/Settings/pages/Account/dialogs/PasswordChange";
import SelectBox from "@/common/components/SelectBox";
import Icon from "@mdi/react";

export const Account = () => {
    const [twoFactorOpen, setTwoFactorOpen] = useState(false);
    const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);

    const { user, login } = useContext(UserContext);
    const { themeMode, setTheme } = useTheme();

    const [updatedField, setUpdatedField] = useState(null);

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    
    const themeOptions = [
        { label: "Auto", value: "auto", icon: mdiMagicStaff },
        { label: "Light", value: "light", icon: mdiWhiteBalanceSunny },
        { label: "Dark", value: "dark", icon: mdiWeatherNight }
    ];

    const updateName = (config) => {
        if (config.firstName && config.firstName === user.firstName) return;
        if (config.lastName && config.lastName === user.lastName) return;

        patchRequest(`accounts/name`, config)
            .then(() => {
                login();
                setUpdatedField(Object.keys(config)[0]);

                setTimeout(() => {
                    setUpdatedField(null);
                }, 1500);
            })
            .catch(err => console.error(err));
    };

    const disable2FA = () => {
        postRequest("accounts/totp/disable").then(() => {
            login();
        }).catch(err => console.error(err));
    }

    useEffect(() => {
        if (user) {
            setFirstName(user.firstName);
            setLastName(user.lastName);
        }
    }, [user]);

    return (
        <div className="account-page">
            <TwoFactorAuthentication open={twoFactorOpen} onClose={() => setTwoFactorOpen(false)} />
            <PasswordChange open={passwordChangeOpen} onClose={() => setPasswordChangeOpen(false)} />
            <div className="account-section">
                <h2><Icon path={mdiAccountEdit} size={0.8} style={{marginRight: '8px'}} />Account Name</h2>
                <div className="section-inner">
                    <div className="form-group">
                        <label htmlFor="firstName">First Name</label>
                        <IconInput icon={mdiAccountCircleOutline} placeholder="First Name"
                                   id="firstName" customClass={updatedField === "firstName" ? " fd-updated" : ""}
                                   value={firstName} setValue={setFirstName}
                                   onBlur={(event) => updateName({ firstName: event.target.value })} />
                    </div>

                    <div className="form-group">
                        <label htmlFor="lastName">Last Name</label>
                        <IconInput icon={mdiAccountCircleOutline} placeholder="Last Name"
                                   id="lastName"
                                   value={lastName} setValue={setLastName}
                                   customClass={updatedField === "lastName" ? " fd-updated" : ""}
                                   onBlur={(event) => updateName({ lastName: event.target.value })} />
                    </div>
                </div>
            </div>

            <div className="account-section">
                <h2><Icon path={mdiPalette} size={0.8} style={{marginRight: '8px'}} />Appearance</h2>
                <div className="section-inner">
                    <p style={{ maxWidth: "25rem" }}>Choose your preferred theme. Auto follows your system settings and adjusts based on time of day.</p>
                    <SelectBox options={themeOptions} selected={themeMode} setSelected={setTheme} />
                </div>
            </div>

            <div className="account-section">
                <div className="tfa-title">
                    <h2><Icon path={mdiShieldCheck} size={0.8} style={{marginRight: '8px'}} />Two-Factor Authentication</h2>
                    {user?.totpEnabled ? <p className="active">Active</p> :
                        <p className="inactive">Inactive</p>}
                </div>
                <div className="section-inner">
                    <p style={{ maxWidth: "25rem" }}>Two-factor authentication adds an additional layer of security to your account by requiring more than just a password to sign in.</p>
                    {!user?.totpEnabled &&
                        <Button text="Enable 2FA" onClick={() => setTwoFactorOpen(true)} />}
                    {user?.totpEnabled ? <Button text="Disable 2FA" onClick={disable2FA} /> : null}
                </div>
            </div>

            <div className="account-section">
                <h2><Icon path={mdiLockReset} size={0.8} style={{marginRight: '8px'}} />Change Password</h2>
                <div className="section-inner">
                    <p style={{ maxWidth: "25rem" }}>Update your password to keep your account secure.</p>

                    <Button text="Change Password"
                            onClick={() => setPasswordChangeOpen(true)} />
                </div>
            </div>
        </div>
    );
};