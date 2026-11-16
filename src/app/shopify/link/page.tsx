"use client";
import { useState } from "react";
import Link from "next/link";
export default function LinkShopifyIdentity() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnUrl, setReturnUrl] = useState("");
  async function link() {
    setBusy(true);
    setError("");
    try {
      const challenge = new URLSearchParams(window.location.search).get(
        "challenge",
      );
      const response = await fetch("/api/shopify/embedded/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setReturnUrl(data.return_url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Link failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-lg space-y-5 p-8">
      <h1 className="text-2xl font-semibold">
        Link Shopify to your warehouse account
      </h1>
      <p>
        This lets your Shopify identity use your existing Stokora permissions.
        The store must already be connected to the same warehouse.
      </p>
      {error && <p role="alert">{error}</p>}
      {returnUrl ? (
        <a
          href={returnUrl}
          className="inline-block bg-primary px-4 py-3 text-primary-foreground"
        >
          Return to Shopify
        </a>
      ) : (
        <button
          disabled={busy}
          onClick={() => void link()}
          className="bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Linking…" : "Link my account"}
        </button>
      )}
      <Link href="/dashboard" className="block text-sm underline">
        Open warehouse dashboard
      </Link>
    </main>
  );
}
