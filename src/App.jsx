import React, { useRef, useState, useEffect } from "react";

export default function App() {
  const [status, setStatus] = useState("idle");
  const [audioUrl, setAudioUrl] = useState(null);

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
      // No saved recording — use default message
      setAudioUrl("/default.mp3");
    }
  };
}


  useEffect(() => {
    loadRecording();
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
     Recording
  ------------------------ */
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        await saveRecording(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setStatus("recording");
      feedbackStartRecording();
    } catch {
      alert("Microphone permission required.");
      setStatus("idle");
    }
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

  function handlePressStart() {
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
    aspectRatio: "390 / 844",  // keeps iPhone shape
    height: "95vh",            // scales to screen height
    maxWidth: "100%",
    backgroundImage: "url('/background.png')",
    backgroundSize: "contain",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  },

  yesZone: {
  position: "absolute",
  top: "2%",
  left: "50%",
  transform: "translateX(-50%)",
  width: "85%",
  aspectRatio: "1 / 1",
  borderRadius: "50%",
  backgroundColor: "rgba(0,255,0,0.3)",
  border: "2px solid green",
},

mainZone: {
  position: "absolute",
  top: "41%",
  left: "71%",
  transform: "translateX(-50%)",
  width: "40%",
  aspectRatio: "1 / 1",
  borderRadius: "50%",
  backgroundColor: "rgba(0,0,255,0.3)",
  border: "2px solid blue",
},

noZone: {
  position: "absolute",
  bottom: "2%",
  left: "50%",
  transform: "translateX(-50%)",
  width: "85%",
  aspectRatio: "1 / 1",
  borderRadius: "50%",
  backgroundColor: "rgba(255,0,0,0.3)",
  border: "2px solid blue",
},

};
