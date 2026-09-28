export function audioDownload(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    // Match the extension to what was actually recorded (m4a vs webm) so the
    // saved file opens in the device's player too
    const ext = blob.type && blob.type.includes('mp4') ? 'm4a' : 'webm';
    a.download = `emergency-audio-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      resolve(); // Proceed to audioSend
    }, 100);
  });
}