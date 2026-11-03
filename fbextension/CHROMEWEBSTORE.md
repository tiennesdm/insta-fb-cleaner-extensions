# Chrome Web Store Listing — FBClean — Facebook Messenger Chat Deleter

> Last Updated: 2026-11-03

## Store Listing

**Extension Name** [REQUIRED]
FBClean — Facebook Messenger Chat Deleter

**Short Description** [REQUIRED]
Automatically delete all Facebook Messenger chat conversations in bulk with visual chat protection and rate-limit cooldowns.

**Detailed Description** [REQUIRED]
Clean up your Facebook Messenger inbox in minutes instead of deleting conversations one by one.

Key Features:
Fast Row-Menu Deletion: Automatically opens each conversation's menu in the Facebook Messenger sidebar and deletes the conversation.
Visual One-Click Chat Protection: Click the Keep badge next to any chat in your Messenger inbox to protect important conversations from deletion.
Auto-Scroll & Pagination: Automatically scrolls down your Facebook Messenger conversation list to load and clean older conversations.
Smart Rate-Limit Protection: Adjustable human-like delays plus automatic batch cooldowns after every 20 deletions help protect your account.
Pause, Resume & Export Backup: Pause or resume cleanup at any time and export a text backup log of all cleaned conversations.

**Category** [REQUIRED]
Social & Communication

**Single Purpose** [REQUIRED]
Automates bulk deletion of Facebook Messenger chat threads on facebook.com/messages and messenger.com.

**Primary Language** [REQUIRED]
English

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Saves user preferences (delay speed, protected names, cooldown settings) and live deletion counters locally in the browser. |
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
| 2.0.0 | 2026-11-03 | Initial release for Facebook & Messenger bulk chat deletion with visual chat protection, auto-scrolling, Pause/Resume, and backup export. | Draft |
