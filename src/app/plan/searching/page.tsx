import type { Metadata } from "next";
import { SearchingView } from "@/components/searching/SearchingView";

export const metadata: Metadata = {
  title: "Comparing routes — Pookie",
  description: "Pookie checks your dates, keeps the event days fixed and estimates routes around your event.",
  robots: { index: false },
};

export default function SearchingPage() {
  return <SearchingView />;
}
