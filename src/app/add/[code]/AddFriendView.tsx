"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Friend, FriendPreview, type FriendPreview as FriendPreviewT } from "@/shared/contracts";
import { ApiClientError, apiFetch } from "@/shared/http/client";

/** Preview a friend code's owner (name, photo, pronouns only) and add them. Owner: friends. */
export function AddFriendView({ code }: { code: string }) {
  const [preview, setPreview] = useState<FriendPreviewT | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "added" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/friends/preview?code=${encodeURIComponent(code)}`, { schema: FriendPreview })
      .then((p) => {
        setPreview(p);
        setState(p.alreadyFriends ? "added" : "ready");
      })
      .catch((cause) => {
        setState("error");
        setMessage(
          cause instanceof ApiClientError && cause.code === "NOT_FOUND"
            ? "This code isn't valid any more. Ask your friend to open their code again and rescan."
            : cause instanceof ApiClientError
              ? cause.message
              : "Something went wrong",
        );
      });
  }, [code]);

  const add = async () => {
    setState("loading");
    try {
      await apiFetch("/api/friends", { method: "POST", body: { code }, schema: Friend });
      setState("added");
    } catch (cause) {
      setState("error");
      setMessage(cause instanceof ApiClientError ? cause.message : "Something went wrong");
    }
  };

  const initials = (preview?.name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 bg-white p-6 text-neutral-900">
      <h1 className="text-2xl font-bold">Add a friend</h1>
      {preview ? (
        <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 p-4">
          {preview.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.image} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl font-semibold text-emerald-800">
              {initials}
            </span>
          )}
          <div>
            <p className="text-xl font-semibold">{preview.name}</p>
            {preview.pronouns ? <p className="text-neutral-600">{preview.pronouns}</p> : null}
          </div>
        </div>
      ) : null}

      {state === "loading" && !preview ? <p className="text-neutral-500">Checking the code…</p> : null}
      {state === "error" ? <p className="rounded-lg bg-red-50 p-3 text-red-700">{message}</p> : null}

      {preview?.self ? (
        <p className="text-neutral-700">That&apos;s your own code. Show it to a friend so they can add you.</p>
      ) : state === "added" ? (
        <p className="rounded-lg bg-emerald-50 p-3 text-emerald-900">
          You and {preview?.name.split(" ")[0]} are friends. You can see each other&apos;s contact details in the Friends tab.
        </p>
      ) : preview && state !== "error" ? (
        <button type="button" onClick={add} disabled={state === "loading"} className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
          {state === "loading" ? "Adding…" : `Add ${preview.name.split(" ")[0]} as a friend`}
        </button>
      ) : null}

      <Link href="/" className="text-center font-medium text-emerald-700 underline">
        Back to the map
      </Link>
    </main>
  );
}
