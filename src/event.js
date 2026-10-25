import { getUtcOffsetLabel, formatLocalTimeAndDate, getCurrentWindowStartTime, getBrowserTimezone, buildSpanView } from "./shared_helpers.js";
import { convertSlotListToTimestamptzList, unpackUserInfo, generateEventSlotTimes } from "./shared_helpers.js";

import { supabase } from "./supabaseClient.js";

import { appState } from "./state.js";

// =====================================================
// STARTUP: connect buttons to functions
// =====================================================

async function setupPage() {

  // Construct event state
  const eid = new URLSearchParams(window.location.search).get("eid");
  if (eid !== null) {
    // TODO: show 404 page
  }
  appState.eventId = eid;
  await loadAllUsersFromDatabase();
  appState.allSlotTimes = generateEventSlotTimes(appState.startDateTime, appState.endDateTime);

  // Populate screen with event info
  document.getElementById("event-title").textContent = appState.eventName;

  var loginButton = document.getElementById("login-submit-button");
  loginButton.addEventListener("click", onLoginSubmitClicked);

  var availabilityButton = document.getElementById("availability-submit-button");
  availabilityButton.addEventListener("click", onAvailabilitySubmitClicked);

  refreshAvailabilityBox();
  populateTimezoneDropdown();
}

await setupPage();

async function saveAvailabilityToDatabase(user, slotTimes) {
  var timestamptzList = convertSlotListToTimestamptzList(slotTimes);

  var response = await supabase.rpc("update_user_avail", {
    p_username: user.name,
    p_eid: appState.eventId,
    p_tzinfo: user.timezone,
    p_timestamps: timestamptzList
  });

  if (response.error !== null) {
    console.log("Saving failed: " + response.error.message);
    document.querySelector('.submit-availability-error-message').innerHTML = response.error.message;
    return;
  }
  // response.data = [{start_time: 'date string ISO'}, ...]
  console.log("Saved! The function returned: ", response.data);
}

async function loadAllUsersFromDatabase() {
  var response = await supabase.rpc("get_event_users", {
    p_eid: appState.eventId
  });

  if (response.error !== null) {
    console.log("Fetch event's users failed: " + response.error.message);
    document.querySelector('.submit-availability-error-message').innerHTML = response.error.message;
    return;
  }

  // response.data shape
// -- {
// --   "eid": "…",
// --   "event_name": "Game night",
// --   "start_time": "2026-10-21T13:00:00+00:00",
// --   "end_time": "2026-10-25T13:00:00+00:00",
// --   "users": [
// --     { "username": "alice", "tzinfo": "Europe/London",
// --       "list_slot_starts": ["2026-10-21T13:00:00+00:00", "..."] }
// --   ]
// -- }
  console.log('get_event_users responses: ', response.data);

  appState.eventName = response.data.event_name;
  appState.startDateTime = response.data.start_time;
  appState.endDateTime = response.data.end_time;

  // Save users' info and their availability
  appState.allUsers = response.data.users.map(unpackUserInfo);
}

// =====================================================
// PAGE 2: timezone dropdown
// =====================================================

function populateTimezoneDropdown() {
  // Fills the <select> with all IANA timezone names, e.g. "Africa/Cairo".
  // Intl.supportedValuesOf gives us the list from the browser.
  var timezoneNames = Intl.supportedValuesOf("timeZone");
  var selectElement = document.getElementById("timezone-select");

  for (var i = 0; i < timezoneNames.length; i++) {
    var optionElement = document.createElement("option");
    optionElement.value = timezoneNames[i];
    optionElement.textContent = timezoneNames[i];
    selectElement.appendChild(optionElement);
  }
}

// =====================================================
// PAGE 2 -> PAGE 3: log in
// =====================================================

async function onLoginSubmitClicked() {
  var typedName = document.getElementById("username-input").value;
  var chosenTimezone = document.getElementById("timezone-select").value;

  if (chosenTimezone === "") {
    chosenTimezone = getBrowserTimezone();   // "leave empty for auto detect"
  }

  appState.currentUser = {
    name: typedName,
    timezone: chosenTimezone
  };

  // If the user already exists, load their old availability into appState.selectedLookup.
  var response = await supabase.rpc("get_user_avail", {
    p_username: appState.currentUser.name,
    p_eid: appState.eventId,
    p_tzinfo: appState.currentUser.timezone
  });

  if (response.error !== null) {
    console.log('Failed at log in: ' + response.error.message);
    document.querySelector(".login-error-message").innerHTML = response.error.message;
    return;
  }
  console.log('Success at log in:\n' + response.data);

  showLoggedInState();
}

function showLoggedInState() {
  var user = appState.currentUser;
  var now = new Date().getTime();

  // swap the input fields for the user info
  document.getElementById("login-section").classList.add("hidden");
  document.getElementById("input-section").classList.remove("hidden");

  document.getElementById("input-tz-offset").textContent = getUtcOffsetLabel(user.timezone);
  document.getElementById("input-tz-name").textContent = user.timezone;
  document.getElementById("input-username").textContent = user.name;
  document.getElementById("input-local-time").textContent = formatLocalTimeAndDate(now, user.timezone);

  // draw the editable span view
  var spanViewElement = document.getElementById("input-span-view");
  buildSpanView(spanViewElement, user.timezone, appState.selectedLookup, true, false);
}

// =====================================================
// PAGE 3 -> PAGE 4: submit availability
// =====================================================
async function onAvailabilitySubmitClicked() {
  var selectedSlotTimes = [];

  for (var key in appState.selectedLookup) {
    selectedSlotTimes.push(Number(key));
  }

  await saveAvailabilityToDatabase(appState.currentUser, selectedSlotTimes);

  await loadAllUsersFromDatabase();
  refreshAvailabilityBox();
}

function refreshAvailabilityBox() {
  // Redraws the top grey box: one read only row per user.
  var rowsContainer = document.getElementById("availability-rows");
  var emptyMessage = document.getElementById("no-availability-message");

  rowsContainer.innerHTML = "";

  if (appState.allUsers.length === 0) {
    emptyMessage.classList.remove("hidden");
    return;
  }

  emptyMessage.classList.add("hidden");

  for (var i = 0; i < appState.allUsers.length; i++) {
    var rowElement = buildUserRow(appState.allUsers[i]);
    rowsContainer.appendChild(rowElement);
  }
}

function buildUserRow(user) {
  // Makes one read only row: timezone info, name, local time, and span view
  // with the black "right now" highlight.
  var rowElement = document.createElement("div");
  rowElement.className = "user-row";

  var offsetCell = document.createElement("div");
  offsetCell.className = "user-info-cell";
  offsetCell.textContent = getUtcOffsetLabel(user.timezone);

  var timezoneCell = document.createElement("div");
  timezoneCell.className = "user-info-cell";
  timezoneCell.textContent = user.timezone;

  var nameCell = document.createElement("div");
  nameCell.className = "user-info-cell";
  nameCell.textContent = user.name;

  var timeCell = document.createElement("div");
  timeCell.className = "user-info-cell";
  timeCell.textContent = formatLocalTimeAndDate(new Date().getTime(), user.timezone);

  var spanViewElement = document.createElement("div");
  spanViewElement.className = "span-view";

  // turn the user's slot list into a lookup so buildSpanView can check it quickly
  var userLookup = {};
  for (var i = 0; i < user.slotTimes.length; i++) {
    userLookup[user.slotTimes[i]] = true;
  }

  buildSpanView(spanViewElement, user.timezone, userLookup, false, true);

  rowElement.appendChild(offsetCell);
  rowElement.appendChild(timezoneCell);
  rowElement.appendChild(nameCell);
  rowElement.appendChild(timeCell);
  rowElement.appendChild(spanViewElement);

  return rowElement;
}
