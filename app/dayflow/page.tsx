import type { Metadata } from "next";
import { DayflowClient } from "./dayflow-client";
import "./dayflow.css";

export const metadata: Metadata = {
  title: "Dayflow",
  description: "A visual daily timeline and task inbox prototype.",
};

export default function DayflowPage() {
  return <DayflowClient />;
}
