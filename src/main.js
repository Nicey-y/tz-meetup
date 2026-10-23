// "import" pulls in the supabase connection from the other file
import { supabase } from "./supabaseClient.js";

// =====================================================
// GLOBAL DATA
// =====================================================

var HALF_HOUR_IN_MS = 30 * 60 * 1000;

// everything the page needs to remember lives in this one object
var appState = {
  eventId: null,            // id of the event row in the database (comes from the URL or from creating the event)
  eventName: "",
  startDate: "",            // "2026-10-23" (creator's timezone)
  endDate: "",              // "2026-10-24" (creator's timezone)
  currentUser: null,        // {name: "david123", timezone: "Africa/Cairo"}
  allSlotTimes: [],         // list of UTC milliseconds, one per 30 min window of the event
  selectedLookup: {},       // {"1761260400000": true} -> slots the current user picked
  allUsers: []              // [{name, timezone, slotTimes: [..]}] loaded from database
};


// =====================================================
// STARTUP: connect buttons to functions
// =====================================================

function setupPage() {
  var createButton = document.getElementById("create-submit-button");
  createButton.addEventListener("click", onCreateSubmitClicked);

  var loginButton = document.getElementById("login-submit-button");
  loginButton.addEventListener("click", onLoginSubmitClicked);

  var availabilityButton = document.getElementById("availability-submit-button");
  availabilityButton.addEventListener("click", onAvailabilitySubmitClicked);

  populateTimezoneDropdown();
}

setupPage();


// =====================================================
// PAGE 1 -> PAGE 2: create event
// =====================================================
function getBrowserTimezone() {
  // returns the timezone name the browser is using, e.g. "Africa/Cairo"
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

async function onCreateSubmitClicked() {
  // read what the user typed
  appState.eventName = document.getElementById("event-name-input").value;
  appState.startDate = document.getElementById("start-date-input").value;
  appState.endDate = document.getElementById("end-date-input").value;

  const success = await saveEventToDatabase(appState.eventName, appState.startDate, appState.endDate);

  if (success) {
    appState.allSlotTimes = generateEventSlotTimes(appState.startDate, appState.endDate);

    // switch screens
    document.getElementById("view-create").classList.add("hidden");
    document.getElementById("view-event").classList.remove("hidden");
    document.getElementById("event-title").textContent = appState.eventName;
  }
}

async function saveEventToDatabase(eventName, startDate, endDate) {
  const userTimezone = getBrowserTimezone();

  // The names on the left of the colons must match the argument names in the function.
  var response = await supabase.rpc("create_event", {
    p_event_name: eventName,
    p_start: startDate,
    p_end: endDate,
    p_tzinfo: userTimezone
  });

  // supabase always answers with an object that has two parts:
  // "error" (empty when everything worked) and "data" (whatever the function returned)
  if (response.error !== null) {
    console.log("Saving failed: " + response.error.message);
    if (response.error.message.includes("event_name_length")) {
      document.querySelector(".error-message").innerHTML = 'Event name must have between 1 and 50 characters.';
    } else {
      document.querySelector(".error-message").innerHTML = response.error.message;
    }
    return false;
  }

  appState.eventId = response.data;
  return true;
}

function generateEventSlotTimes(startDate, endDate) {
  // Builds a list of every 30 min window in the event.
  // The dates are in the creator's own timezone (the browser's timezone),
  // so "2026-10-23T00:00:00" parsed by the browser is already creator-local midnight.
  var startTime = new Date(startDate + "T00:00:00").getTime();
  var endTime = new Date(endDate + "T23:59:59").getTime();

  var slotTimes = [];
  var currentTime = startTime;

  while (currentTime < endTime) {
    slotTimes.push(currentTime);
    currentTime = currentTime + HALF_HOUR_IN_MS;
  }

  return slotTimes;
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
// TIME HELPERS
// =====================================================

function getTimeParts(utcMilliseconds, timezone) {
  // Converts a moment in time into the clock values in the given timezone.
  // Returns something like {hour: 23, minute: 5, month: "Oct", day: "23", weekday: "Fri"}
  var formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric"
  });

  var partsList = formatter.formatToParts(new Date(utcMilliseconds));
  var result = {};

  for (var i = 0; i < partsList.length; i++) {
    var part = partsList[i];
    if (part.type === "hour") {
      result.hour = parseInt(part.value, 10);
    }
    if (part.type === "minute") {
      result.minute = parseInt(part.value, 10);
    }
    if (part.type === "month") {
      result.month = part.value;
    }
    if (part.type === "day") {
      result.day = part.value;
    }
    if (part.type === "weekday") {
      result.weekday = part.value;
    }
  }

  return result;
}

function getUtcOffsetLabel(timezone) {
  // returns something like "GMT+2" for the timezone
  var formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset"
  });
  var partsList = formatter.formatToParts(new Date());

  for (var i = 0; i < partsList.length; i++) {
    if (partsList[i].type === "timeZoneName") {
      return partsList[i].value;
    }
  }
  return "";
}

function padWithZero(number) {
  if (number < 10) {
    return "0" + number;
  }
  return String(number);
}

function formatLocalTimeAndDate(utcMilliseconds, timezone) {
  // returns text like "23:05 Fri, Oct 23"
  var parts = getTimeParts(utcMilliseconds, timezone);
  var timeText = padWithZero(parts.hour) + ":" + padWithZero(parts.minute);
  var dateText = parts.weekday + ", " + parts.month + " " + parts.day;
  return timeText + " " + dateText;
}

function getCurrentWindowStartTime() {
  // rounds "right now" down to the start of the current 30 min window
  var now = new Date().getTime();
  return Math.floor(now / HALF_HOUR_IN_MS) * HALF_HOUR_IN_MS;
}

function convertMillisecondsToTimestamptz(utcMilliseconds) {
  // 1761260400000 -> "2026-10-23T23:00:00.000Z"
  // Postgres accepts this text for a timestamptz column or parameter
  var dateObject = new Date(utcMilliseconds);
  return dateObject.toISOString();
}

function convertTimestamptzToMilliseconds(timestamptzText) {
  // "2026-10-23T23:00:00+00:00" -> 1761260400000
  // Supabase sends timestamptz back as text, so use this when loading data
  return new Date(timestamptzText).getTime();
}

function convertSlotListToTimestamptzList(slotTimes) {
  var result = [];
  for (var i = 0; i < slotTimes.length; i++) {
    result.push(convertMillisecondsToTimestamptz(slotTimes[i]));
  }
  return result;
}

// =====================================================
// THE SPAN VIEW (the scrollable row of 30 min boxes)
// =====================================================

function buildSpanView(containerElement, timezone, selectedLookup, isEditable, showCurrentWindow) {
  // Draws one scrollable row of 30 min boxes inside containerElement.
  //   timezone          -> which timezone the hour labels are shown in
  //   selectedLookup    -> which boxes are green
  //   isEditable        -> true: clicking toggles a box. false: read only
  //   showCurrentWindow -> true: draw the black outlined box around "now"

  containerElement.innerHTML = "";

  if (isEditable === true) {
    containerElement.classList.add("editable");
  }

  var trackElement = document.createElement("div");
  trackElement.className = "span-track";

  var currentWindowStart = getCurrentWindowStartTime();

  for (var i = 0; i < appState.allSlotTimes.length; i++) {
    var slotTime = appState.allSlotTimes[i];
    var parts = getTimeParts(slotTime, timezone);

    // a column holds the hour label on top and the box below it
    var columnElement = document.createElement("div");
    columnElement.className = "slot-column";

    var labelElement = document.createElement("div");
    labelElement.className = "slot-label";
    if (parts.minute === 0) {
      labelElement.textContent = parts.hour + ":00";
    }

    var boxElement = document.createElement("div");
    boxElement.className = "slot-box";
    boxElement.setAttribute("data-slot-time", String(slotTime));

    // the thick line at 00:00, with the date written inside
    if (parts.hour === 0 && parts.minute === 0) {
      boxElement.classList.add("midnight");
      boxElement.textContent = parts.month + " " + parts.day;
    }

    if (selectedLookup[slotTime] === true) {
      boxElement.classList.add("selected");
    }

    if (showCurrentWindow === true && slotTime === currentWindowStart) {
      boxElement.classList.add("current-window");
    }

    if (isEditable === true) {
      boxElement.addEventListener("click", onSlotClicked);
    }

    columnElement.appendChild(labelElement);
    columnElement.appendChild(boxElement);
    trackElement.appendChild(columnElement);
  }

  containerElement.appendChild(trackElement);

  scrollToCurrentWindow(containerElement, currentWindowStart);
}

function scrollToCurrentWindow(containerElement, currentWindowStart) {
  // PLACEHOLDER: find the box whose data-slot-time equals currentWindowStart
  // and set containerElement.scrollLeft so that box is visible.
  // If the current time is outside the event range, scroll to the start (scrollLeft = 0).
}

function onSlotClicked(clickEvent) {
  // click a box to select, click again to deselect
  var clickedBox = clickEvent.currentTarget;
  var slotTime = clickedBox.getAttribute("data-slot-time");

  if (appState.selectedLookup[slotTime] === true) {
    delete appState.selectedLookup[slotTime];
    clickedBox.classList.remove("selected");
  } else {
    appState.selectedLookup[slotTime] = true;
    clickedBox.classList.add("selected");
  }
}


// =====================================================
// PAGE 3 -> PAGE 4: submit availability
// =====================================================

// Helper to unpack user info from querying for all users of an event
// userObj = {username: str, tzinfo: str, list_slot_starts: [str]}
function unpackUserInfo(userObj) {
  var selectedSlotTimes = userObj.list_slot_starts.map(convertTimestamptzToMilliseconds);

  return {
    name: userObj.username,
    timezone: userObj.tzinfo,
    slotTimes: selectedSlotTimes
  };
}
async function onAvailabilitySubmitClicked() {
  var selectedSlotTimes = [];

  for (var key in appState.selectedLookup) {
    selectedSlotTimes.push(Number(key));
  }

  await saveAvailabilityToDatabase(appState.currentUser, selectedSlotTimes);

  await loadAllUsersFromDatabase();
  refreshAvailabilityBox();
}

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

  // response.data = [{ , ,list_slot_starts: (4) ['2026-10-23T13:00:00+00:00',...]}]
  console.log('get_event_users responses: ', response.data);

  // Save users' info and their availability
  appState.allUsers = response.data.map(unpackUserInfo);
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
