import React, { useRef, useState, useEffect } from "react";

export default function App() {
  const [status, setStatus] = useState("idle");
  const [audioUrl, setAudioUrl] = useState(null);

  const holdTimerRef = useRef(null);
  const streamRef = useRef(null);
  const isHoldingRef = useRef(false);

  const playbackRef = useRef(null);
  const yesRef = useRef(null);
  const noRef = useRef(null);

  /* -----------------------
     Web Audio Refs
  ------------------------ */
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const audioDataRef = useRef([]);
  const sampleRateRef = useRef(44100);

  /* -----------------------
     IndexedDB Setup
  ------------------------ */
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("voiceAidDB", 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("recordings")) {
          db.createObjectStore("recordings");
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject("DB failed");
    });
  }

  async function saveRecording(blob) {
    const db = await openDB();
    const tx = db.transaction("recordings", "readwrite");
    const store = tx.objectStore("recordings");
    store.put(blob, "latest");
  }

  async function loadRecording() {
    const db = await openDB();
    const tx = db.transaction("recordings", "readonly");
    const store = tx.objectStore("recordings");
    const request = store.get("latest");

    request.onsuccess = () => {
      if (request.result) {
        const url = URL.createObjectURL(request.result);
        setAudioUrl(url);
      } else {
        setAudioUrl("/default.mp3");
      }
    };
  }

  /* -----------------------
     Request Mic Permission Once
  ------------------------ */
  async function ensureMicPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      alert("Microphone permission is required.");
    }
  }

  useEffect(() => {
    loadRecording();
    ensureMicPermission();
  }, []);

  /* -----------------------
     Feedback
  ------------------------ */
  function feedbackStartRecording() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = 880;
    gain.gain.value = 0.2;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.2);

    if (navigator.vibrate) {
      navigator.vibrate(200);
    }
  }

  /* -----------------------
     Web Audio Recorder (WAV)
  ------------------------ */

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      // 🔥 Critical for iOS
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      sampleRateRef.current = audioContext.sampleRate;

      const source = audioContext.createMediaStreamSource(stream);

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      audioDataRef.current = [];

      processor.onaudioprocess = (event) => {
        const channelData = event.inputBuffer.getChannelData(0);
        audioDataRef.current.push(new Float32Array(channelData));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setStatus("recording");
      feedbackStartRecording();
    } catch (err) {
      console.error(err);
      alert("Recording failed.");
      setStatus("idle");
    }
  }

  function stopRecording() {
    const audioContext = audioContextRef.current;
    const processor = processorRef.current;
    const stream = streamRef.current;

    if (!audioContext || !processor || !stream) {
      setStatus("idle");
      return;
    }

    processor.disconnect();
    audioContext.close();
    stream.getTracks().forEach((t) => t.stop());

    const mergedBuffer = mergeBuffers(audioDataRef.current);
    const wavBlob = encodeWAV(mergedBuffer, sampleRateRef.current);

    const url = URL.createObjectURL(wavBlob);
    setAudioUrl(url);
    saveRecording(wavBlob);

    setStatus("idle");
  }

  function mergeBuffers(buffers) {
    let length = 0;
    buffers.forEach((b) => (length += b.length));

    const result = new Float32Array(length);
    let offset = 0;

    buffers.forEach((buffer) => {
      result.set(buffer, offset);
      offset += buffer.length;
    });

    return result;
  }

  function encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, samples.length * 2, true);

    floatTo16BitPCM(view, 44, samples);

    return new Blob([view], { type: "audio/wav" });
  }

  function floatTo16BitPCM(view, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  function playRecording() {
    if (!audioUrl) return;
    playbackRef.current.currentTime = 0;
    playbackRef.current.play();
  }

  /* -----------------------
     Press Logic
  ------------------------ */

  function handlePressStart() {
    isHoldingRef.current = true;
    setStatus("arming");

    holdTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current) {
        startRecording();
      }
    }, 700);
  }

  function handlePressEnd() {
    isHoldingRef.current = false;
    clearTimeout(holdTimerRef.current);

    if (status === "arming") {
      setStatus("idle");
      playRecording();
    } else if (status === "recording") {
      stopRecording();
    }
  }

  function playYes() {
    yesRef.current.currentTime = 0;
    yesRef.current.play();
  }

  function playNo() {
    noRef.current.currentTime = 0;
    noRef.current.play();
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <div style={styles.yesZone} onClick={playYes} />

        <div
          style={{
            ...styles.mainZone,
            backgroundColor:
              status === "recording"
                ? "rgba(255,0,0,0.4)"
                : status === "arming"
                ? "rgba(255,165,0,0.4)"
                : "transparent",
          }}
          onPointerDown={handlePressStart}
          onPointerUp={handlePressEnd}
          onPointerCancel={handlePressEnd}
          onContextMenu={(e) => e.preventDefault()}
        />

        <div style={styles.noZone} onClick={playNo} />

        <audio ref={playbackRef} src={audioUrl} />
        <audio ref={yesRef} src="/yes.mp3" preload="auto" />
        <audio ref={noRef} src="/no.mp3" preload="auto" />
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    height: "100vh",
    width: "100vw",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  container: {
    position: "relative",
    aspectRatio: "390 / 844",
    height: "95vh",
    maxWidth: "100%",
    backgroundImage: "url('/background.png')",
    backgroundSize: "contain",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  },
  yesZone: {
    position: "absolute",
    inset: 0,
    clipPath: "polygon(0% 0%, 100% 0%, 100% 44%, 0% 54%)",
    zIndex: 1,
  },
  noZone: {
    position: "absolute",
    inset: 0,
    clipPath: "polygon(0% 58%, 100% 48%, 100% 100%, 0% 100%)",
    zIndex: 1,
  },
  mainZone: {
    position: "absolute",
    top: "50%",
    left: "71%",
    transform: "translate(-50%, -50%)",
    width: "30%",
    aspectRatio: "1 / 1",
    borderRadius: "50%",
    zIndex: 2,
    WebkitTouchCallout: "none",
    WebkitUserSelect: "none",
    userSelect: "none",
    touchAction: "none",
  },
};
