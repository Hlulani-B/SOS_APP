import React, { useState, useEffect } from "react";
import { AVATARS, AvatarImage } from "./avatars.jsx";
import { getFullName, setName, setSurname, setAvatar } from "../functions/apiUsers.js";
import SideMenu from "./SideMenu";

export default function ProfilePage() {
  const email = localStorage.getItem("sos_email") || "";
  const [name, setNameField] = useState("");
  const [surname, setSurnameField] = useState("");
  const [avatar, setAvatarField] = useState(AVATARS[0].id);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfile() {
      if (!email) return;
      try {
        const profile = await getFullName(email);
        if (profile) {
          setNameField(profile.name || "");
          setSurnameField(profile.surname || "");
        }
        const stored = JSON.parse(localStorage.getItem("user_profile") || "{}");
        if (stored.avatar) setAvatarField(stored.avatar);
      } catch (err) {
        console.warn("Could not load profile:", err.message);
      }
    }
    loadProfile();
  }, [email]);

  async function handleSave(e) {
    e.preventDefault();
    const first = name.trim();
    const last = surname.trim();
    if (!first || !last) {
      setError("Please fill in both names.");
      return;
    }
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await setName(email, first);
      await setSurname(email, last);
      await setAvatar(email, avatar);
      localStorage.setItem("user_profile", JSON.stringify({
        firstName: first, surname: last, avatar: avatar
      }));
      setSaved(true);
      setBusy(false);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <SideMenu title="Profile" theme="light" />
      <div style={styles.page}>
        <h1 style={styles.title}>Edit Profile</h1>
        <p style={styles.subtitle}>Update your name and picture</p>
        <form onSubmit={handleSave} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>First name</label>
            <input style={styles.input} type="text" value={name}
              onChange={(e) => setNameField(e.target.value)} placeholder="Your first name" />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Surname</label>
            <input style={styles.input} type="text" value={surname}
              onChange={(e) => setSurnameField(e.target.value)} placeholder="Your surname" />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Avatar</label>
            <div style={styles.avatarGrid}>
              {AVATARS.map((a) => (
                <button key={a.id} type="button"
                  style={{...styles.avatarTile, ...(avatar === a.id ? styles.avatarSelected : {})}}
                  onClick={() => setAvatarField(a.id)}>
                  <AvatarImage id={a.id} size="100%" />
                </button>
              ))}
            </div>
          </div>
          {error && <div style={styles.error}>{error}</div>}
          {saved && <div style={styles.success}>Profile saved!</div>}
          <button type="submit" style={styles.submit} disabled={busy}>
            {busy ? "Saving..." : saved ? "Saved!" : "Save Changes"}
          </button>
        </form>
      </div>
    </>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)", padding: "80px 24px 40px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  title: { fontSize: 28, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px", textAlign: "center" },
  subtitle: { fontSize: 15, color: "#6b7280", margin: "0 0 32px", textAlign: "center" },
  form: { maxWidth: 420, margin: "0 auto" },
  field: { marginBottom: 24 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { width: "100%", padding: "14px 16px", fontSize: 16, border: "1.5px solid #e5e7eb", borderRadius: 12, background: "#fff", color: "#1a1a1a", boxSizing: "border-box" },
  avatarGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 },
  avatarTile: { aspectRatio: "1", border: "2px solid #e5e7eb", borderRadius: 12, background: "#fff", cursor: "pointer", padding: 8 },
  avatarSelected: { borderColor: "#3b82f6", boxShadow: "0 0 0 3px rgba(59,130,246,0.2)" },
  error: { background: "#fef2f2", color: "#dc2626", padding: "12px 16px", borderRadius: 10, fontSize: 14, marginBottom: 16 },
  success: { background: "#f0fdf4", color: "#16a34a", padding: "12px 16px", borderRadius: 10, fontSize: 14, marginBottom: 16 },
  submit: { width: "100%", padding: 16, fontSize: 16, fontWeight: 600, color: "#fff", background: "linear-gradient(135deg, #3b82f6, #2563eb)", border: "none", borderRadius: 12, cursor: "pointer" }
};
