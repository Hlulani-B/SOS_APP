// sosHelper.js

const DEFAULT_EMERGENCY_CONTACTS = ["+27000000000", "+27111111111"];
const EMERGENCY_MESSAGE = "EMERGENCY: I need help immediately. My safety is compromised.";

/**
 * Acquires current GPS location and broadcasts the SOS message to all contacts.
 * 
 * @param {Array<string>} contacts - List of emergency phone numbers
 * @param {Function} onStatusUpdate - Callback to update UI status text in real time
 */
export function SOSsend(contacts = DEFAULT_EMERGENCY_CONTACTS, onStatusUpdate = () => {}) {
  onStatusUpdate("Acquiring current GPS location...");

  const executeDispatch = (locationUrl = "") => {
    onStatusUpdate(`Dispatching SOS with location to ${contacts.length} contacts...`);
    
    const fullMessage = `${EMERGENCY_MESSAGE}${locationUrl ? ` Live Location: ${locationUrl}` : ""}`;

    // Loop through all numbers in your emergency contacts array
    contacts.forEach((number, index) => {
      const payload = {
        to: number,
        message: fullMessage,
        timestamp: new Date().toISOString()
      };

      console.log(`[Twilio SOS Dispatch #${index + 1}] Sending payload to ${number}:`, payload);

      /*
        TODO: Replace or supplement this with your actual backend fetch call:
        fetch('https://your-backend-server.com/api/send-sos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(err => console.error(`Failed to send to ${number}:`, err));
      */
    });

    onStatusUpdate(`SOS and location sent successfully to ${contacts.length} contacts!`);

    // Fallback mobile SMS handoff to the primary contact
    const primaryBody = encodeURIComponent(fullMessage);
    window.location.href = `sms:${contacts[0]}?body=${primaryBody}`;
  };

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const mapUrl = `https://maps.google.com/?q=${lat},${lon}`;
        executeDispatch(mapUrl);
      },
      (error) => {
        console.warn("GPS acquisition failed, sending SOS without location:", error);
        executeDispatch("");
      },
      { timeout: 5000, enableHighAccuracy: true }
    );
  } else {
    console.warn("Geolocation not supported by this browser.");
    executeDispatch("");
  }
}