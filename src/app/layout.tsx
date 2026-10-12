import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pookie",
  description: "Plan a trip around an event whose dates cannot move.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", background: "#f6f7f9", color: "#14171c" }}>
        {children}
      </body>
    </html>
  );
}
