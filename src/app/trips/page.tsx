import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/DashboardView";

export const metadata: Metadata = {
  title: "My trips — EventHopper",
  description: "The trips you saved in this browser, with their estimated totals.",
};

export default function TripsPage() {
  return <DashboardView />;
}
