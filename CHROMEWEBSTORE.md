# Chrome Web Store Listing — InstaClean — Instagram DM & Chat Deleter

> Last Updated: 2026-11-05

## Store Listing

**Extension Name** [REQUIRED]
InstaClean — Instagram DM & Chat Deleter

**Short Description** [REQUIRED] (129 chars)
Bulk delete Instagram Direct chats or unsend sent messages automatically with visual Keep Chat protection and smart cooldowns.

**Detailed Description** [REQUIRED]
Clean up your Instagram Direct inbox in minutes instead of spending hours deleting conversations or unsending messages one by one.

FEATURES
• Delete All Chats Mode — Automatically removes entire conversation threads from your Instagram Direct inbox, including Primary, General, and Message Requests tabs.
• Unsend Sent Messages Mode — Unsends messages you sent inside an open conversation so they are removed for everyone.
• Full Wipe Mode — Unsends your messages inside each conversation first, then deletes the conversation thread.
• Keep Conversations Protection — Tick any chat in the floating Keep Conversations checklist, type usernames to protect, or click the Keep badge directly on any inbox row so important conversations are never deleted.
• Automatic Inbox Scrolling — Automatically scrolls through your inbox list to load and clean older conversations.
• Group Chat Controls — Choose whether to skip group chats or leave and delete them automatically.
• Smart Rate-Limit Protection — Adjustable human-like delays plus automatic batch cooldown pauses after every 20 deletions help protect your account from temporary action blocks.
• Pause, Resume, Close & Export Backup — Pause, resume, or close the floating panel at any time and download a text backup log of all cleaned items.

HOW TO USE
1. Open Instagram Direct in Google Chrome (https://www.instagram.com/direct/inbox/).
2. Tick any conversations you want to protect in the Keep Conversations checklist or click the Keep badge next to those chats.
3. Click the InstaClean toolbar icon or use the floating control panel in the bottom-right corner.
4. Select your preferred cleanup mode and click Start.

PRIVACY
This extension does not collect, store, or transmit any personal data. All preferences, protected chat lists, and session logs are stored locally on your device and never sent to any external server.

PERMISSIONS
• "Read and change your data on www.instagram.com" — Needed to display the on-page control panel and perform user-initiated chat deletions and message unsends inside Instagram Direct.
• "Storage" — Needed to save your cleanup settings, protected conversation names, and session counters locally on your device.
• "Tabs & Scripting" — Needed to locate or focus your open Instagram Direct tab and display the control panel without requiring a manual page reload.

SUPPORT
Found a bug or have a feature request? Open an issue at:
https://github.com/tiennesdm/insta-fb-cleaner-extensions/issues

Version 2.0.0 — Added floating Keep Conversations checklist, close/reopen panel controls, automatic inbox scrolling, batch cooldowns, and backup log export.

**Category** [REQUIRED]
Social & Communication

**Single Purpose** [REQUIRED]
Automates bulk deletion of Instagram Direct chat threads and unsending of user-sent messages on Instagram Web.

**Primary Language** [REQUIRED]
English

**Privacy Policy URL** [REQUIRED]
https://github.com/tiennesdm/insta-fb-cleaner-extensions/blob/master/PRIVACY_POLICY.md

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Package ZIP [REQUIRED] | Manifest V3 ZIP | ✅ Ready | `releases/instaclean-cws-upload.zip` |
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 PNG | ✅ Ready | `store-assets/instaclean-screenshot-1280x800.png` |
| Small Promo Tile [RECOMMENDED] | 440×280 PNG | ✅ Ready | `store-assets/instaclean-promo-440x280.png` |

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Saves user preferences (deletion mode, delay speed, protected conversation names, cooldown settings) and live deletion counters locally in the browser. |
| `tabs` | permissions | Checks whether an Instagram Direct tab is already open and navigates or focuses it when the user starts a cleanup job from the popup. |
| `scripting` | permissions | Injects the automation script and status overlay into an already-open Instagram tab so the user does not need to manually refresh the page after installing. |
| `https://www.instagram.com/*` | host_permissions | Required to interact with the Instagram Direct inbox and conversation UI on instagram.com to perform user-initiated chat deletions and message unsends. |

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
| 2.0.0 | 2026-11-05 | Added floating Keep Conversations checklist, close/reopen widget button, on-page visual chat protection badges, automatic inbox pagination scrolling, batch rate-limit cooldowns, Pause/Resume controls, and backup log export. | Ready for Upload |
| 1.0.0 | 2026-11-01 | Initial release with Delete All Chats, Unsend Sent Messages, Full Wipe mode, username skip list, and on-page controller. | Archived |
