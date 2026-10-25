import { supabase } from "./supabaseClient.js";
import { getBrowserTimezone } from "./shared_helpers";
// =====================================================
// STARTUP: connect buttons to functions
// =====================================================

function setupPage() {
  var createButton = document.getElementById("create-submit-button");
  createButton.addEventListener("click", onCreateSubmitClicked);
}
setupPage();


// =====================================================
// VIEW 1 -> VIEW 2: create event
// =====================================================

async function onCreateSubmitClicked() {
  // read what the user typed
  const eventName = document.getElementById("event-name-input").value;
  const startDate = document.getElementById("start-date-input").value;
  const endDate = document.getElementById("end-date-input").value;

  const eid = await saveEventToDatabase(eventName, startDate, endDate);

  if (eid) {
    // Redirect to event page
    window.location.href = "event.html?eid=" + eid;
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
    } else if (response.error.message.includes("invalid input syntax for type date: \"\"")) {
      document.querySelector(".error-message").innerHTML = 'Start and end date cannot be null.';
    } else {
      document.querySelector(".error-message").innerHTML = response.error.message;
    }
    return null;
  }

  return response.data;
}