import React, { useRef, useState, useEffect } from "react";

export default function App() {
  const [status, setStatus] = useState("idle");
  const [audioUrl, setAudioUrl] = useState(null);
  const [hasPermission, setHasPermission] = useState(false);

  const holdTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const isHoldingRef = useRef(false);

  const playbackRef = useRef(null);
  const yesRef = useRef(null);
  const noRef = useRef(null);

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

  useEffect(() => {
    loadRecording();

    // Clean up mic when app fully closes
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
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
     Permission (only once)
  ------------------------ */
  async function requestPermission() {
    if (hasPermission) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setHasPermission(true);
    } catch {
      alert("Microphone permission required.");
    }
  }

  /* -----------------------
     Hold Logic
  ------------------------ */
  async function handlePressStart() {
    if (!hasPermission) {
      await requestPermission();
      return; // first interaction only grants permission
    }

    isHoldingRef.current = true;
    setStatus("arming");

    holdTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current) {
        startRecording();
      }
    }, 5000);
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

  /* -----------------------
     Recording
  ------------------------ */
  function startRecording() {
    if (!streamRef.current) return;

    chunksRef.current = [];

    const recorder = new MediaRecorder(streamRef.current);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      if (chunksRef.current.length === 0) return;

      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      await saveRecording(blob);
    };

    recorder.start();
    setStatus("recording");
    feedbackStartRecording();
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setStatus("idle");
  }

  function playRecording() {
    if (!audioUrl) return;
    playbackRef.current.currentTime = 0;
    playbackRef.current.play();
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
          style={styles.mainZone}
          onTouchStart={handlePressStart}
          onTouchEnd={handlePressEnd}
          onMouseDown={handlePressStart}
          onMouseUp={handlePressEnd}
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
  },
};
