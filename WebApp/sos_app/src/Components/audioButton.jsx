import React, { useState, useRef } from 'react';
import { audioDownload } from '../functions/audioDownload';
import { audioSend } from '../functions/audioSend';
import { pickRecorderMime } from '../functions/recorderFormats';
import { logCapture, describeCaptureEnv } from '../functions/recDiagnostics';
import { requestOwnership, releaseOwnership, isActiveOwner } from './recordingManager';

const OWNERSHIP_ID = 'audio';

export function AudioRecorder({
  width,
  height,
  text = 'Record Audio',
  idleColor = '#E3D852',
  idleTextColor = '#333333',
  activeColor = '#dc3545',
  activeTextColor = '#ffffff',
  style = {},
  onPress,
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
      logCapture(`audio tap: ${describeCaptureEnv()}`);
      // Request microphone stream (mono: better quality at low bitrate)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 }
      });
      logCapture(`audio getUserMedia OK: audioTracks=${stream.getAudioTracks().length}`);

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

      // Compress at the source: low-bitrate mono keeps files tiny so a
      // recording always fits an email attachment. MP4/AAC (m4a) is tried
      // first because mail apps open it natively - most cannot play webm.
      const mimeType = pickRecorderMime([
        "audio/mp4;codecs=mp4a.40.2",
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm"
      ]);
      const options = { audioBitsPerSecond: 24000 };
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
          type: mediaRecorder.mimeType || 'audio/webm'
        });

        // Release microphone hardware
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);

        // Sequential execution: Download first, then Send
        try {
          await audioDownload(blob);
          await audioSend(blob);
        } catch (error) {
          console.error("Error during audio processing pipeline:", error);
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
      logCapture(`audio ERR: ${err?.name || ''}: ${err?.message || err}`);
      releaseOwnership(OWNERSHIP_ID); // failed to start - don't hold the lock
      console.error("Error accessing microphone:", err);
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

  return (
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
  );
}
