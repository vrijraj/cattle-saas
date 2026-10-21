"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };

export function CodeScanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!scanning) return;
    let stop = false;
    let stream: MediaStream | null = null;
    const video = videoRef.current;

    async function run() {
      const DetectorCtor = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => Detector }).BarcodeDetector;
      if (!DetectorCtor || !video) {
        setNote("This browser has no camera scanner. Type the code below.");
        setScanning(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        setNote("The camera could not start. Type the code below.");
        setScanning(false);
        return;
      }
      video.srcObject = stream;
      await video.play();
      const detector = new DetectorCtor({ formats: ["qr_code"] });
      const tick = async () => {
        if (stop || !video) return;
        try {
          const found = await detector.detect(video);
          const value = found[0]?.rawValue?.trim();
          if (value) {
            stop = true;
            stream?.getTracks().forEach((track) => track.stop());
            router.push(`/scan?code=${encodeURIComponent(value)}`);
            return;
          }
        } catch {
          setNote("The camera could not read a code. Type it below.");
        }
        if (!stop) window.setTimeout(() => void tick(), 400);
      };
      void tick();
    }

    void run();
    return () => {
      stop = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [router, scanning]);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <button
        className="h-11 w-full rounded-full bg-primary text-sm font-medium text-primary-foreground"
        type="button"
        onClick={() => {
          setNote("");
          setScanning(true);
        }}
      >
        Scan with camera
      </button>
      {scanning ? <video ref={videoRef} className="aspect-[3/4] w-full rounded-xl bg-black object-cover" muted playsInline /> : null}
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      <form action="/scan" className="grid gap-2">
        <label className="text-sm font-medium" htmlFor="lookup-code">
          Animal code, straw code, or tag link
        </label>
        <input
          id="lookup-code"
          name="code"
          className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
          placeholder="MIL-GIR-001 or STR-G14-2026-013"
        />
        <button className="h-11 rounded-full border border-border text-sm font-medium" type="submit">
          Look up
        </button>
      </form>
    </div>
  );
}
