"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Slate } from "./ui";

type Tab = "upload" | "paste";

const ACCEPTED = [".pdf", ".docx", ".doc", ".txt", ".md", ".fountain"];

function isAccepted(name: string) {
  return ACCEPTED.some((ext) => name.toLowerCase().endsWith(ext));
}

export function Intake() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  /* The whole window is the drop target. Anything less and a file released a
     few pixels off the box makes the browser navigate away to open it. */
  useEffect(() => {
    // dragleave fires on every child boundary crossed, so count depth instead.
    let depth = 0;
    const carriesFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    function onEnter(event: DragEvent) {
      if (!carriesFiles(event)) return;
      depth++;
      setDragging(true);
    }
    function onOver(event: DragEvent) {
      if (!carriesFiles(event)) return;
      event.preventDefault(); // without this the drop is refused
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }
    function onLeave(event: DragEvent) {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    }
    function onDrop(event: DragEvent) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const dropped = event.dataTransfer?.files?.[0];
      if (!dropped) return;
      if (!isAccepted(dropped.name)) {
        setTab("upload");
        setError(`Rehearse reads PDF, DOCX, and text. ${dropped.name} isn't one.`);
        return;
      }
      setTab("upload");
      setFile(dropped);
      setError(null);
    }

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      let response: Response;
      if (tab === "upload") {
        if (!file) {
          setError("Choose a file first.");
          setBusy(false);
          return;
        }
        const form = new FormData();
        form.append("file", file);
        response = await fetch("/api/scripts", { method: "POST", body: form });
      } else {
        response = await fetch("/api/scripts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "That didn't go through.");
      router.push(`/script/${data.id}?start=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through.");
      setBusy(false);
    }
  }

  return (
    <>
      {/* Portalled to the body: an animated ancestor holds a transform, which
          would otherwise make it the containing block for this fixed layer. */}
      {mounted &&
        createPortal(
          <div
            aria-hidden
            className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${
              dragging ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <div className="absolute inset-0 bg-stage-900/85 backdrop-blur-sm" />
            <div className="relative m-6 flex min-h-[42vh] w-full max-w-2xl items-center justify-center rounded-page border-2 border-dashed border-marker bg-marker/[0.06]">
              <p className="marquee text-[clamp(1.6rem,4.4vw,2.6rem)] text-paper">
                Drop it anywhere
              </p>
            </div>
          </div>,
          document.body,
        )}

      <div className="rounded-page border border-stage-700 bg-stage-800/70 p-2 backdrop-blur-sm">
        <div className="flex gap-1 px-1 pb-2 pt-1">
          {(["upload", "paste"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setTab(option)}
              className={`slate rounded-page px-3.5 py-2 transition-colors ${
                tab === option
                  ? "bg-stage-700 text-paper"
                  : "text-muted hover:text-paper"
              }`}
            >
              {option === "upload" ? "Upload sides" : "Paste text"}
            </button>
          ))}
        </div>

        {tab === "upload" ? (
          <label
            className={`flex min-h-[9.5rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-page border border-dashed px-6 py-8 text-center transition-colors ${
              dragging
                ? "border-marker bg-marker/[0.07]"
                : "border-stage-600 hover:border-cue"
            }`}
          >
            <input
              ref={fileInput}
              type="file"
              accept={`${ACCEPTED.join(",")},application/pdf,text/plain`}
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
            />
            {file ? (
              <>
                <p className="script text-[0.9375rem] text-paper">{file.name}</p>
                <Slate className="text-muted">
                  {(file.size / 1024).toFixed(0)} KB — click to replace
                </Slate>
              </>
            ) : (
              <>
                <p className="text-[0.9375rem] text-paper">
                  Drop a PDF, DOCX, or text file
                </p>
                <Slate className="text-muted">or click to browse</Slate>
              </>
            )}
          </label>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={"MARA\nYou read the whole thing?\n\nDEV\nTwice. On the train."}
            className="script hide-scrollbar min-h-[9.5rem] w-full resize-y rounded-page border border-stage-600 bg-stage-900/60 p-4 text-[0.9375rem] leading-relaxed text-paper placeholder:text-stage-600 focus:border-cue focus:outline-none"
          />
        )}

        <div className="flex items-center justify-between gap-4 px-1 pb-1 pt-3">
          <p
            role={error ? "alert" : undefined}
            className="text-[0.8125rem] text-tally empty:hidden"
          >
            {error}
          </p>
          <Button onClick={submit} disabled={busy} className="ml-auto">
            {busy ? "Reading…" : "Break down the script"}
          </Button>
        </div>
      </div>
    </>
  );
}
