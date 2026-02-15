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

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [audioUrl]);

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

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
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
    <div style={styles.container}>
      {/* YES invisible zone */}
      <div style={styles.yesZone} onClick={playYes} />

      {/* MAIN invisible zone */}
      <div
        style={styles.mainZone}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
      />

      {/* NO invisible zone */}
      <div style={styles.noZone} onClick={playNo} />

      <audio ref={playbackRef} src={audioUrl} />
      <audio ref={yesRef} src="/yes.mp3" preload="auto" />
      <audio ref={noRef} src="/no.mp3" preload="auto" />
    </div>
  );
}

const styles = {
  container: {
  position: "relative",
  width: "390px",         // iPhone width
  height: "844px",        // iPhone height
  maxWidth: "100vw",
  maxHeight: "100vh",
  margin: "0 auto",
  backgroundImage: "url('/background.png')",
  backgroundSize: "contain",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
},


  yesZone: {
    position: "absolute",
    top: "8%",
    left: "50%",
    transform: "translateX(-50%)",
    width: "260px",
    height: "260px",
    borderRadius: "50%",
  },

  mainZone: {
  position: "absolute",
  top: "30%",
  left: "71%",
  transform: "translateX(-50%)",
  width: "260px",
  height: "260px",
  borderRadius: "50%",
},


  noZone: {
    position: "absolute",
    bottom: "6%",
    left: "50%",
    transform: "translateX(-50%)",
    width: "260px",
    height: "260px",
    borderRadius: "50%",
  },
};
