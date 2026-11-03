# Chrome Web Store Listing — InstaClean — Instagram DM & Chat Deleter

> Last Updated: 2026-11-02

## Store Listing

**Extension Name** [REQUIRED]
InstaClean — Instagram DM & Chat Deleter

**Short Description** [REQUIRED]
Automatically delete all Instagram Direct chat threads or unsend sent messages in bulk with visual chat protection and rate-limit cooldowns.

**Detailed Description** [REQUIRED]
Clean up your Instagram Direct Inbox in minutes instead of spending hours deleting conversations one by one.

Key Features:
Delete All Chats Mode: Automatically removes entire conversation threads from your Instagram Direct Inbox, including Primary, General, and Message Requests tabs.
Unsend Sent Messages Mode: Unsends messages you sent inside an open conversation so they are removed for everyone.
Full Wipe Mode: Unsends your messages inside each conversation first, then deletes the conversation thread.
Visual One-Click Chat Protection: Click the Keep button directly next to any chat in your Instagram inbox to protect important conversations from deletion.
Group Chat Controls: Choose whether to skip group chats or leave and delete them automatically.
Smart Rate-Limit Protection: Adjustable human-like delays plus automatic batch cooldowns after every 20 deletions help protect your account from temporary action blocks.
Pause, Resume & Export Backup: Pause or resume cleanup at any time and export a text backup log of all cleaned items.

How to Use:
1. Open Instagram Direct in Chrome (https://www.instagram.com/direct/inbox/).
2. Click the Keep badge next to any chats you want to keep safe.
3. Click the InstaClean extension icon or use the floating control panel in the bottom-right corner.
4. Choose your deletion mode and click Start to clean your inbox automatically.

Privacy & Security:
All actions happen locally inside your browser tab on Instagram. Your messages, usernames, and credentials are never collected, stored on external servers, or shared with third parties.

**Category** [REQUIRED]
Social & Communication

**Single Purpose** [REQUIRED]
Automates bulk deletion of Instagram Direct chat threads and unsending of user-sent messages on Instagram Web.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Saves user preferences (deletion mode, delay speed, skipped usernames, cooldown settings) and live deletion counters locally in the browser. |
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
| 2.0.0 | 2026-11-02 | Added on-page visual chat protection badges, container-relative sent message detection, background tab execution support, virtualized scroll deduplication, batch rate-limit cooldowns, Pause/Resume controls, Group/Requests support, and backup log export. | Draft |
| 1.0.0 | 2026-11-01 | Initial release with Delete All Chats, Unsend Sent Messages, Full Wipe mode, username skip list, and on-page controller. | Draft |
