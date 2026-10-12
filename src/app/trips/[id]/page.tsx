import type { Metadata } from "next";
import { TripView } from "@/components/trip/TripView";

export const metadata: Metadata = {
  title: "Your routes — EventHopper",
  description: "Routes around your fixed event, with estimated costs and public search links.",
};

export default function TripPage() {
  return <TripView />;
}
