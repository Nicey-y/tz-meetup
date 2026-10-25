// =====================================================
// GLOBAL DATA
// =====================================================

// everything the page needs to remember lives in this one object
export var appState = {
  eventId: null,            // id of the event row in the database (comes from the URL or from creating the event)
  eventName: "",
  startDateTime: "",        // "2026-10-23T23:00:00+00:00" (creator's timezone)
  endDateTime: "",          // "2026-10-23T23:00:00+00:00" (creator's timezone)
  currentUser: null,        // {name: "david123", timezone: "Africa/Cairo"}
  allSlotTimes: [],         // list of UTC milliseconds, one per 30 min window of the event
  selectedLookup: {},       // {"1761260400000": true} -> slots the current user picked
  allUsers: []              // [{name, timezone, slotTimes: [..]}] loaded from database
};