const BLOCKED_STORAGE_KEY = 'meetAudioBlockerBlockedIds';

let blockedIds = new Set();
const mediaState = new WeakMap();

const TILE_SELECTORS = [
  '[data-participant-id]',
  '[data-requested-participant-id]',
  '[data-self-name]',
  '[data-participant-name]'
];

function stableHash(input) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return `participant_${Math.abs(hash)}`;
}

function normalizeName(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function maybeNameFromAriaLabel(value) {
  if (!value) {
    return '';
  }

  const firstChunk = value.split(',')[0];
  if (!firstChunk) {
    return '';
  }

  return normalizeName(firstChunk);
}

function getNameFromElement(element) {
  if (!element) {
    return '';
  }

  const directAttrs = [
    element.getAttribute('data-participant-name'),
    element.getAttribute('data-self-name'),
    maybeNameFromAriaLabel(element.getAttribute('aria-label'))
  ];

  for (const candidate of directAttrs) {
    if (candidate && normalizeName(candidate)) {
      return normalizeName(candidate);
    }
  }

  const labeledNode = element.querySelector('[data-participant-name], [data-self-name], [aria-label]');
  if (labeledNode) {
    const nestedAttrs = [
      labeledNode.getAttribute('data-participant-name'),
      labeledNode.getAttribute('data-self-name'),
      maybeNameFromAriaLabel(labeledNode.getAttribute('aria-label'))
    ];

    for (const candidate of nestedAttrs) {
      if (candidate && normalizeName(candidate)) {
        return normalizeName(candidate);
      }
    }
  }

  const textCandidates = element.querySelectorAll('span, div');
  for (const node of textCandidates) {
    const text = normalizeName(node.textContent || '');
    if (!text || text.length > 70) {
      continue;
    }

    if (/^[A-Za-zÀ-ÿ0-9._'’ -]{2,}$/.test(text)) {
      return text;
    }
  }

  return '';
}

function getParticipantTiles() {
  const seen = new Set();
  const tiles = [];

  for (const selector of TILE_SELECTORS) {
    const found = document.querySelectorAll(selector);
    for (const element of found) {
      if (seen.has(element)) {
        continue;
      }
      seen.add(element);
      tiles.push(element);
    }
  }

  return tiles;
}

function getParticipantId(tile, name) {
  const explicit = tile.getAttribute('data-participant-id') || tile.getAttribute('data-requested-participant-id');
  if (explicit) {
    return explicit;
  }

  const fallback = name || 'unknown';
  return stableHash(fallback);
}

function listParticipants() {
  const dedup = new Map();

  for (const tile of getParticipantTiles()) {
    const name = getNameFromElement(tile) || 'Unknown participant';
    const id = getParticipantId(tile, name);

    if (!dedup.has(id)) {
      dedup.set(id, { id, name });
    }
  }

  return Array.from(dedup.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function findTileById(participantId) {
  const tiles = getParticipantTiles();
  for (const tile of tiles) {
    const name = getNameFromElement(tile) || 'Unknown participant';
    const id = getParticipantId(tile, name);
    if (id === participantId) {
      return tile;
    }
  }

  return null;
}

function muteMediaElement(mediaElement) {
  if (!mediaState.has(mediaElement)) {
    mediaState.set(mediaElement, {
      muted: mediaElement.muted,
      volume: mediaElement.volume
    });
  }

  mediaElement.muted = true;
  mediaElement.volume = 0;
}

function restoreMediaElement(mediaElement) {
  const previous = mediaState.get(mediaElement);
  if (!previous) {
    return;
  }

  mediaElement.muted = previous.muted;
  mediaElement.volume = previous.volume;
  mediaState.delete(mediaElement);
}

function applyBlocking() {
  let mutedCount = 0;

  for (const participantId of blockedIds) {
    const tile = findTileById(participantId);
    if (!tile) {
      continue;
    }

    const mediaElements = tile.querySelectorAll('audio, video');
    for (const media of mediaElements) {
      muteMediaElement(media);
      mutedCount += 1;
    }
  }

  return mutedCount;
}

function applyUnblocking(participantId) {
  const tile = findTileById(participantId);
  if (!tile) {
    return 0;
  }

  const mediaElements = tile.querySelectorAll('audio, video');
  let restored = 0;

  for (const media of mediaElements) {
    restoreMediaElement(media);
    restored += 1;
  }

  return restored;
}

async function loadBlockedIds() {
  const stored = await chrome.storage.local.get(BLOCKED_STORAGE_KEY);
  const ids = stored[BLOCKED_STORAGE_KEY];
  blockedIds = new Set(Array.isArray(ids) ? ids : []);
}

async function saveBlockedIds() {
  await chrome.storage.local.set({
    [BLOCKED_STORAGE_KEY]: Array.from(blockedIds)
  });
}

function buildResponse(extra = {}) {
  return {
    participants: listParticipants(),
    blockedIds: Array.from(blockedIds),
    ...extra
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) {
    return;
  }

  if (message.type === 'GET_PARTICIPANTS') {
    sendResponse(buildResponse({ mutedMediaElements: applyBlocking() }));
    return;
  }

  if (message.type === 'BLOCK_PARTICIPANT_AUDIO') {
    blockedIds.add(message.participantId);
    saveBlockedIds().then(() => {
      const mutedMediaElements = applyBlocking();
      sendResponse(buildResponse({ mutedMediaElements }));
    });
    return true;
  }

  if (message.type === 'UNBLOCK_PARTICIPANT_AUDIO') {
    blockedIds.delete(message.participantId);
    saveBlockedIds().then(() => {
      const restoredMediaElements = applyUnblocking(message.participantId);
      sendResponse(buildResponse({ restoredMediaElements }));
    });
    return true;
  }
});

loadBlockedIds().then(() => {
  applyBlocking();
  setInterval(applyBlocking, 700);
});
