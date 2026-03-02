const participantSelect = document.getElementById('participantSelect');
const blockBtn = document.getElementById('blockBtn');
const unblockBtn = document.getElementById('unblockBtn');
const refreshBtn = document.getElementById('refreshBtn');
const blockedList = document.getElementById('blockedList');
const statusEl = document.getElementById('status');

async function getMeetTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs.find((tab) => tab.url?.startsWith('https://meet.google.com/'));
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b00020' : '';
}

async function sendMessageToMeet(message) {
  const tab = await getMeetTab();
  if (!tab?.id) {
    throw new Error('Open an active Google Meet tab first.');
  }
  return chrome.tabs.sendMessage(tab.id, message);
}

function renderParticipants(participants) {
  participantSelect.innerHTML = '';

  if (!participants.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No participants found yet';
    participantSelect.append(option);
    participantSelect.disabled = true;
    return;
  }

  participantSelect.disabled = false;
  for (const participant of participants) {
    const option = document.createElement('option');
    option.value = participant.id;
    option.textContent = participant.name;
    participantSelect.append(option);
  }
}

function renderBlocked(participants, blockedIds) {
  blockedList.innerHTML = '';

  if (!blockedIds.length) {
    const li = document.createElement('li');
    li.textContent = 'Nobody blocked';
    blockedList.append(li);
    return;
  }

  for (const id of blockedIds) {
    const li = document.createElement('li');
    const participant = participants.find((entry) => entry.id === id);
    li.textContent = participant?.name ?? `Unknown (${id.slice(0, 8)})`;
    blockedList.append(li);
  }
}

async function refreshView() {
  try {
    const response = await sendMessageToMeet({ type: 'GET_PARTICIPANTS' });
    if (!response) {
      throw new Error('No response from the Meet page.');
    }

    renderParticipants(response.participants);
    renderBlocked(response.participants, response.blockedIds);

    setStatus(
      `Found ${response.participants.length} participant(s). Active mute targets: ${response.mutedMediaElements ?? 0}.`
    );
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function blockSelected() {
  if (!participantSelect.value) {
    setStatus('Pick a participant first.', true);
    return;
  }

  try {
    const response = await sendMessageToMeet({
      type: 'BLOCK_PARTICIPANT_AUDIO',
      participantId: participantSelect.value
    });

    renderParticipants(response.participants);
    renderBlocked(response.participants, response.blockedIds);
    setStatus(`Participant blocked. Media elements muted: ${response.mutedMediaElements ?? 0}.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function unblockSelected() {
  if (!participantSelect.value) {
    setStatus('Pick a participant first.', true);
    return;
  }

  try {
    const response = await sendMessageToMeet({
      type: 'UNBLOCK_PARTICIPANT_AUDIO',
      participantId: participantSelect.value
    });

    renderParticipants(response.participants);
    renderBlocked(response.participants, response.blockedIds);
    setStatus(`Participant unblocked. Media restored: ${response.restoredMediaElements ?? 0}.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

refreshBtn.addEventListener('click', refreshView);
blockBtn.addEventListener('click', blockSelected);
unblockBtn.addEventListener('click', unblockSelected);

document.addEventListener('DOMContentLoaded', refreshView);
