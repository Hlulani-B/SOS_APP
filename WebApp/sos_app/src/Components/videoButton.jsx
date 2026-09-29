import React, { useState, useRef, useEffect } from 'react';
import { videoDownload } from '../functions/videoDownload';
import { videoSend } from '../functions/videoSend';
import { pickRecorderMime } from '../functions/recorderFormats';
import { logCapture, describeCaptureEnv } from '../functions/recDiagnostics';
import { requestOwnership, releaseOwnership, isActiveOwner } from './recordingManager';

const OWNERSHIP_ID = 'video';

export function VideoRecorder({
  width,
  height,
  text = 'Record',
  idleColor = '#556B2F',
  idleTextColor = '#ffffff',
  activeColor = '#dc3545',
  activeTextColor = '#ffffff',
  style = {},
  onPress,
  apiRef,
  children
}) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const finishRef = useRef({ promise: Promise.resolve(), resolve: null });
  const startingRef = useRef(false);

  // Stops this component if it is running. Always returns a promise that
  // resolves once the current job (stop -> download -> send) has fully
  // completed - this is what other components await before taking over.
  const stopAndFinish = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop(); // onstop runs the download -> send pipeline
    }
    return finishRef.current.promise;
  };

  const handleStartRecording = async () => {
    // Claim the single action lock. If another component is active, it is
    // stopped here and we wait until it has completely finished its job.
    await requestOwnership(OWNERSHIP_ID, stopAndFinish);
    try {
      // Record the capture environment + attempt so the native Settings screen
      // can show WHY it failed (no alert() is allowed - it would break the
      // disguise). Best-effort and invisible on the normal UI.
      logCapture(`video tap: ${describeCaptureEnv()}`);
      // Low-res capture keeps the file small enough to always email
      // (~1MB per minute at these bitrates). The preview element below is
      // a hidden 1px element, so nothing shows on screen either way.
      // facingMode=environment forces the REAR lens: the recording points
      // at whatever is in front of the phone (propped, pocketed, bag) and
      // the screen never has to face her. 'ideal' not 'exact' so devices
      // with no rear camera still record instead of failing the alert.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 15 }
        },
        audio: { channelCount: 1 }
      });
      logCapture(`video getUserMedia OK: videoTracks=${stream.getVideoTracks().length} audioTracks=${stream.getAudioTracks().length}`);

      // Someone else may have taken over while permission was being granted
      if (!isActiveOwner(OWNERSHIP_ID)) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      chunksRef.current = [];

      // The promise handed to whoever stops us next
      finishRef.current.promise = new Promise((resolve) => {
        finishRef.current.resolve = resolve;
      });

      // Compress at the source: ~120kbps video + 24kbps audio keeps files
      // small (~1MB per minute) so a recording always fits an email
      // attachment. MP4 (H.264/AAC) is tried first because mail apps open
      // it natively - most cannot play webm at all.
      const mimeType = pickRecorderMime([
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp8,opus",
        "video/webm"
      ]);
      const options = { videoBitsPerSecond: 120000, audioBitsPerSecond: 24000 };
      if (mimeType) options.mimeType = mimeType;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType || 'video/webm'
        });
        logCapture(`video stop: chunks=${chunksRef.current.length} bytes=${blob.size} type=${blob.type}`);

        // Turn off camera/mic hardware light
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);

        // Execute functions sequentially: Download first, then Send
        try {
          await videoDownload(blob);
          await videoSend(blob);
        } catch (error) {
          console.error("Error during video processing pipeline:", error);
        } finally {
          // Job fully finished - hand the lock to the next action
          if (finishRef.current.resolve) finishRef.current.resolve();
          releaseOwnership(OWNERSHIP_ID);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      // No alert() - it would break the disguise in front of an onlooker
      logCapture(`video ERR: ${err?.name || ''}: ${err?.message || err}`);
      releaseOwnership(OWNERSHIP_ID); // failed to start - don't hold the lock
      console.error("Error accessing camera/microphone:", err);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleClick = () => {
    if (onPress) onPress();
    if (isRecording) {
      handleStopRecording();
      return;
    }
    if (startingRef.current) return; // a start is already in progress
    startingRef.current = true;
    handleStartRecording().finally(() => {
      startingRef.current = false;
    });
  };

  // Non-tap triggers (the "help" wake word) drive this exact pipeline
  // through a shared ref. Assigned in an effect that re-runs every render,
  // so the closure always sees the current isRecording/startingRef state;
  // the button itself is untouched.
  useEffect(() => {
    if (!apiRef) return undefined;
    apiRef.current = {
      toggle: handleClick,
      isRecording: () => isRecording || startingRef.current
    };
    return () => { apiRef.current = null; };
  });

  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style.wrapper }}>
      {/* Hidden micro-video preview element */}
      <video
        autoPlay
        playsInline
        muted
        style={{ width: '1px', height: '1px', opacity: 0, position: 'absolute', pointerEvents: 'none' }}
        ref={video => {
          if (video && mediaRecorderRef.current && mediaRecorderRef.current.stream) {
            video.srcObject = mediaRecorderRef.current.stream;
          }
        }}
      />

      <button
        onClick={handleClick}
        style={{
          width: width,
          height: height,
          backgroundColor: isRecording ? activeColor : idleColor,
          color: isRecording ? activeTextColor : idleTextColor,
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 0.2s ease',
          ...style
        }}
      >
        {/* Label never changes - only the color turns red while recording,
            so the disguise holds even when someone is watching the screen */}
        {children || text}
      </button>
    </div>
  );
}
