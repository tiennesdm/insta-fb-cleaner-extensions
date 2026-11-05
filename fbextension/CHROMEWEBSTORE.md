# Chrome Web Store Listing — FBClean — Facebook Messenger Chat Deleter

> Last Updated: 2026-11-05

## Store Listing

**Extension Name** [REQUIRED]
FBClean — Facebook Messenger Chat Deleter

**Short Description** [REQUIRED] (125 chars)
Bulk delete Facebook Messenger conversations automatically with visual Keep Chat protection, auto-scroll, and smart cooldowns.

**Detailed Description** [REQUIRED]
Clean up your Facebook Messenger inbox in minutes instead of deleting conversations one by one.

FEATURES
• Bulk Delete Messenger Conversations — Automatically opens the action menu on each conversation in your Facebook Messenger sidebar and permanently deletes the thread.
• Keep Conversations Protection — Tick any chat in the floating Keep Conversations checklist, type contact names to keep safe, or click the Keep badge directly on any chat row so important conversations are never deleted.
• Automatic Inbox Scrolling — Automatically scrolls down your Facebook Messenger conversation list to load and clean older threads.
• Smart Rate-Limit Protection — Adjustable human-like delays plus automatic batch cooldown pauses after every 20 deletions help protect your account.
• Pause, Resume, Close & Export Backup — Pause, resume, or close the floating panel at any time and export a text backup log of all cleaned conversations.

HOW TO USE
1. Open Facebook Messages (https://www.facebook.com/messages/) or Messenger (https://www.messenger.com/) in Google Chrome.
2. Tick any conversations you want to keep safe in the Keep Conversations checklist or click the Keep badge on those chat rows.
3. Click the FBClean toolbar icon or use the floating control panel in the bottom-right corner.
4. Click Delete All FB Chats to start cleaning your inbox automatically.

PRIVACY
This extension does not collect, store, or transmit any personal data. All preferences, protected chat lists, and session logs are stored locally on your device and never sent to any external server.

PERMISSIONS
• "Read and change your data on www.facebook.com and www.messenger.com" — Needed to display the on-page control panel and perform user-initiated chat deletions inside Facebook Messenger.
• "Storage" — Needed to save your cleanup settings, protected conversation names, and session counters locally on your device.
• "Tabs & Scripting" — Needed to locate or focus your open Facebook Messenger tab and display the control panel without requiring a manual page reload.

SUPPORT
Found a bug or have a feature request? Open an issue at:
https://github.com/tiennesdm/insta-fb-cleaner-extensions/issues

Version 2.0.0 — Initial release with Keep Conversations checklist, visual chat row protection, automatic inbox scrolling, batch cooldowns, close/reopen panel controls, and backup export.

**Category** [REQUIRED]
Social & Communication

**Single Purpose** [REQUIRED]
Automates bulk deletion of Facebook Messenger chat threads on facebook.com/messages and messenger.com.

**Primary Language** [REQUIRED]
English

**Privacy Policy URL** [REQUIRED]
https://github.com/tiennesdm/insta-fb-cleaner-extensions/blob/master/PRIVACY_POLICY.md

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Package ZIP [REQUIRED] | Manifest V3 ZIP | ✅ Ready | `releases/fbclean-cws-upload.zip` |
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `fbextension/icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 PNG | ✅ Ready | `store-assets/fbclean-screenshot-1280x800.png` |
| Small Promo Tile [RECOMMENDED] | 440×280 PNG | ✅ Ready | `store-assets/fbclean-promo-440x280.png` |

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Saves user preferences (delay speed, protected conversation names, cooldown settings) and live deletion counters locally in the browser. |
| `tabs` | permissions | Checks whether a Facebook Messages or Messenger tab is already open and focuses it when the user starts a cleanup job from the popup. |
| `scripting` | permissions | Injects the automation script and status overlay into an already-open Facebook tab so the user does not need to manually refresh the page. |
| `https://www.facebook.com/*` | host_permissions | Required to interact with the Facebook Messages UI on facebook.com/messages to perform user-initiated chat deletions. |
| `https://www.messenger.com/*` | host_permissions | Required to interact with the standalone Messenger UI on messenger.com to perform user-initiated chat deletions. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 2.0.0 | 2026-11-05 | Initial release for Facebook & Messenger bulk chat deletion with Keep Conversations checklist, visual chat protection, auto-scrolling, Pause/Resume/Close controls, and backup export. | Ready for Upload |
