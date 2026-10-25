import { appState } from "./state.js";

// =====================================================
// TIME HELPERS
// =====================================================
var HALF_HOUR_IN_MS = 30 * 60 * 1000;

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

export function getUtcOffsetLabel(timezone) {
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

export function formatLocalTimeAndDate(utcMilliseconds, timezone) {
  // returns text like "23:05 Fri, Oct 23"
  var parts = getTimeParts(utcMilliseconds, timezone);
  var timeText = padWithZero(parts.hour) + ":" + padWithZero(parts.minute);
  var dateText = parts.weekday + ", " + parts.month + " " + parts.day;
  return timeText + " " + dateText;
}

export function getCurrentWindowStartTime() {
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

export function convertSlotListToTimestamptzList(slotTimes) {
  var result = [];
  for (var i = 0; i < slotTimes.length; i++) {
    result.push(convertMillisecondsToTimestamptz(slotTimes[i]));
  }
  return result;
}

export function getBrowserTimezone() {
  // returns the timezone name the browser is using, e.g. "Africa/Cairo"
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// =====================================================
// THE SPAN VIEW (the scrollable row of 30 min boxes)
// =====================================================

export function buildSpanView(containerElement, timezone, selectedLookup, isEditable, showCurrentWindow) {
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

// Helper to unpack user info from querying for all users of an event
// userObj = {username: str, tzinfo: str, list_slot_starts: [str]}
export function unpackUserInfo(userObj) {
  var selectedSlotTimes = userObj.list_slot_starts.map(convertTimestamptzToMilliseconds);

  return {
    name: userObj.username,
    timezone: userObj.tzinfo,
    slotTimes: selectedSlotTimes
  };
}

export function generateEventSlotTimes(startDateTime, endDateTime) {
  // Builds a list of every 30 min window in the event.
  // The dates are in the creator's own timezone (the browser's timezone),
  // so "2026-10-23T00:00:00" parsed by the browser is already creator-local midnight.
  var startTime = convertTimestamptzToMilliseconds(startDateTime);
  var endTime = convertTimestamptzToMilliseconds(endDateTime);

  var slotTimes = [];
  var currentTime = startTime;

  while (currentTime < endTime) {
    slotTimes.push(currentTime);
    currentTime = currentTime + HALF_HOUR_IN_MS;
  }

  return slotTimes;
}
