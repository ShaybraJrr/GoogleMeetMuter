# Google Meet Participant Audio Blocker

A Chrome extension that adds a popup UI where you can:

1. Fetch participants currently detected on your active Google Meet tab.
2. Select a participant from a dropdown.
3. Block that participant's audio locally on your browser.

## How it works

- The content script scans Meet participant tile attributes (`data-participant-id`, `data-requested-participant-id`, `data-participant-name`, and related labels) to build a participant list.
- When someone is blocked, all `audio` / `video` elements in that participant tile are forced to `muted=true` and `volume=0`.
- The extension remembers blocked participants in `chrome.storage.local` and re-applies muting repeatedly while the call is active.
- The popup status line reports how many media elements are currently being muted, so you can verify it is doing real work.

> Note: This is a client-side/local block only. It does not mute participants for anyone else in the call.

## Load extension in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Open a Google Meet tab and use the extension popup.

## Known limitations

- Google Meet's DOM changes regularly. Selector logic may need updates over time.
- If participant names/tiles are unavailable, some entries may appear as "Unknown participant".
- If Meet streams all remote audio through a shared element (instead of per-tile media), per-participant local muting is not technically possible with DOM-only controls.
