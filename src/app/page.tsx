import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: "Pookie — plan around the dates you can't move",
  description:
    "Pookie compares trip routes around a fixed event and a fixed budget, and labels where every price came from.",
};

export default function Home() {
  return <Landing />;
}
