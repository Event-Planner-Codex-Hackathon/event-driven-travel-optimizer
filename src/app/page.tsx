// Placeholder home page — the product UI is owned by the frontend track and replaces this file.
import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "64px auto", padding: "0 16px", lineHeight: 1.5 }}>
      <h1 style={{ marginBottom: 4 }}>EventHopper</h1>
      <p>Plan a trip around an event whose dates cannot move.</p>
      <p>
        The product UI is in progress. The backend can be exercised from the{" "}
        <Link href="/dev">developer console</Link>. Guests can also{" "}
        <Link href="/prices">look up a single flight or hotel price</Link>.
      </p>
    </main>
  );
}
