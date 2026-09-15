import type { Metadata } from "next";
import { DayflowClient } from "../dayflow/dayflow-client";
import "../dayflow/dayflow.css";

export const metadata: Metadata = {
  title: "Study Flow",
  description: "A visual CA study timeline, backlog and focus workspace.",
};

export default function StudyFlowPage() {
  return <DayflowClient />;
}
