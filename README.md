# InstaClean & FBClean — Bulk Chat & Message Deleter (Chrome Extensions)

A pair of privacy-first Manifest V3 Chrome Extensions to automatically bulk delete conversations on **Instagram Direct (`InstaClean`)** and **Facebook Messenger (`FBClean`)**, complete with visual **Keep Conversations** protection, auto-scrolling, and smart rate-limit cooldowns.

---

## 📦 Included Extensions

| Extension | Folder | Chrome Web Store Upload ZIP | Target Sites |
|---|---|---|---|
| **InstaClean — Instagram DM & Chat Deleter** | `/` (Root) | `releases/instaclean-cws-upload.zip` | `https://www.instagram.com/direct/*` |
| **FBClean — Facebook Messenger Chat Deleter** | `/fbextension` | `releases/fbclean-cws-upload.zip` | `https://www.facebook.com/messages/*`, `https://www.messenger.com/*` |

---

## ✨ Key Features

1. **🛡️ Keep Conversations Manager (Widget Checklist + Row Badges)**:
   - Select which conversations to keep safe directly inside the floating on-page control panel (`🛡️ Keep Conversations` checklist) or type any name/username and click **`+ Keep`**.
   - Click the **`🛡️ Keep` / `🗑️ Clean`** badge on individual conversation rows in your inbox to toggle protection with a single click.
2. **🗑️ Bulk Delete Conversations & Unsend Sent Messages**:
   - **Delete All Chats Mode**: Automatically opens and permanently deletes conversation threads one by one.
   - **Unsend Sent Messages Mode (Instagram)**: Unsends messages sent by you inside an open conversation so they are removed for everyone.
   - **Full Wipe Mode (Instagram)**: Unsends your messages first and then deletes the entire conversation thread.
3. **🔄 Automatic Inbox Scrolling & Pagination**:
   - Automatically scrolls through your inbox list to load older conversations until all non-protected chats are cleaned.
4. **⏳ Smart Rate-Limit Cooldowns**:
   - Configurable human-like delays between actions plus automatic batch cooldown pauses every 20 deletions to protect your account from temporary action blocks.
5. **⏸️ Pause, Resume, Close (`✕`) & Export Backup**:
   - Pause or resume at any time, minimize (`—`) or close (`✕`) the floating widget (with a compact `🧹 Open` pill to reopen), and export a `.txt` backup log of all deleted items.
6. **🔒 100% Local & Privacy-First**:
   - All actions run locally inside your browser tab. No personal data, messages, or credentials ever leave your device.

---

## 🚀 How to Install Unpacked in Google Chrome

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click **Load unpacked**:
   - Select `/Users/shubhammehta/Downloads/instaextension` to load **InstaClean (Instagram)**.
   - Select `/Users/shubhammehta/Downloads/instaextension/fbextension` to load **FBClean (Facebook Messenger)**.
4. Open `https://www.instagram.com/direct/inbox/` or `https://www.facebook.com/messages/`.
5. Tick any chats you want to protect under **`🛡️ Keep Conversations`**, then click **▶ Start**!

---

## 🌐 Chrome Web Store Submission Assets

All required Chrome Web Store submission packages and graphics are pre-built and ready:
- **Instagram CWS Package**: `releases/instaclean-cws-upload.zip`
- **Facebook CWS Package**: `releases/fbclean-cws-upload.zip`
- **Screenshots (1280×800) & Promo Tiles (440×280)**: `store-assets/`
- **Store Listing Copy & Justifications**: [CHROMEWEBSTORE.md](./CHROMEWEBSTORE.md) and [fbextension/CHROMEWEBSTORE.md](./fbextension/CHROMEWEBSTORE.md)
- **Privacy Policy**: [PRIVACY_POLICY.md](./PRIVACY_POLICY.md)
