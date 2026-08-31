"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import type { PrimaryUse } from "@/lib/profile/onboarding";

type Feature = { key: string; title: string; description: string; href: string; icon: IconName; tips: string[] };

const features: Record<string, Feature> = {
  today: { key: "today", title: "Today Plan", description: "See the study work that matters today and keep your day realistic.", href: "/planner/today", icon: "sparkles", tips: ["Start with today's priorities", "Keep planned minutes realistic", "Mark work complete as you go"] },
  planner: { key: "planner", title: "Planner", description: "Build and adjust study, revision and test tasks around your attempt.", href: "/planner", icon: "calendar", tips: ["Add your own tasks", "Connect work to subjects and chapters", "Use forecast and goals when you need a longer view"] },
  progress: { key: "progress", title: "Progress tracker", description: "Track completion, two revisions and two test stages without losing history.", href: "/progress", icon: "chart", tips: ["Update a stage with one tap", "Filter by subject or group", "Open analytics when you want the bigger picture"] },
  revision: { key: "revision", title: "Revision settings", description: "Tune how CA Progress spaces revision work around your study routine.", href: "/planner/revision-settings", icon: "settings", tips: ["Choose revision intervals", "Set preferred weekdays", "Keep the plan aligned with your available time"] },
  study: { key: "study", title: "Study mode", description: "Run focused study sessions with targets, pause/resume and saved study history.", href: "/study", icon: "timer", tips: ["Start a focused session", "Attach a subject or chapter", "Use your streak as feedback, not pressure"] },
  calendar: { key: "calendar", title: "Calendar", description: "See study tasks, revision work and important dates in one time-based view.", href: "/calendar", icon: "calendar", tips: ["Review busy days early", "Balance study and test work", "Use it alongside your daily plan"] },
  updates: { key: "updates", title: "ICAI Updates", description: "Follow verified updates relevant to your level, attempt and subjects.", href: "/updates", icon: "bell", tips: ["Open the official source when needed", "Check applicability before acting", "Use Syllabus for the academic structure"] },
  syllabus: { key: "syllabus", title: "Syllabus", description: "Browse your verified level, group, subjects and chapter structure.", href: "/syllabus", icon: "book", tips: ["Open a subject to see its structure", "Use attempt-aware academic data", "Keep official-source context close by"] },
  tests: { key: "tests", title: "Tests", description: "Keep test work connected to your chapter progress and revision state.", href: "/tests", icon: "tests", tips: ["Track Test 1 and Test 2 stages", "Use progress to spot weak coverage", "Plan test work before exam-heavy weeks"] },
  community: { key: "community", title: "Community", description: "Use general, level and subject spaces without losing academic context.", href: "/community", icon: "community", tips: ["Ask subject-specific doubts", "Follow announcements and replies", "Keep discussions connected to your CA level"] },
  resources: { key: "resources", title: "Resources", description: "Keep your notes, files and approved shared study resources organized.", href: "/resources", icon: "book", tips: ["Keep private uploads private", "Use approved shared resources", "Find ICAI resources from official sources"] },
  notes: { key: "notes", title: "Notes", description: "Create private study notes and connect them to subjects or chapters.", href: "/notes", icon: "book", tips: ["Keep quick revision notes", "Tag notes for easier retrieval", "Connect notes to the chapter you are studying"] },
};

const focusTours: Record<PrimaryUse, string[]> = {
  plan: ["today", "planner"],
  progress: ["progress", "revision"],
  focus: ["study", "calendar"],
  updates: ["updates", "syllabus"],
  tests: ["tests", "progress"],
  community: ["community", "resources"],
};
const trendingKeys = ["community", "resources", "notes", "tests"];

export function FeatureGuide({ primaryUse, next }: { primaryUse: PrimaryUse; next: string }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [includeTrending, setIncludeTrending] = useState(false);
  const [saving, setSaving] = useState(false);
  const primaryKeys = focusTours[primaryUse];
  const extraKeys = useMemo(() => trendingKeys.filter((key) => !primaryKeys.includes(key)).slice(0, 3), [primaryKeys]);
  const queue = includeTrending ? [...primaryKeys, ...extraKeys] : primaryKeys;
  const atTrendingPrompt = !includeTrending && index >= primaryKeys.length;
  const current = !atTrendingPrompt ? features[queue[index]] : null;

  async function finish(action: "complete" | "skip") {
    setSaving(true);
    const response = await fetch("/api/onboarding/guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    setSaving(false);
    if (!response.ok) return;
    router.push(next);
    router.refresh();
  }

  if (atTrendingPrompt) return <div className="feature-guide">
    <header className="feature-guide__top"><div><Badge tone="brand">Quick guide</Badge><h1>Want a quick look at popular features too?</h1><p>You have seen the features closest to your goal. These are useful extras many students explore next.</p></div><Button variant="ghost" disabled={saving} onClick={() => finish("skip")}>Skip guide</Button></header>
    <Card className="feature-guide__card"><CardBody>
      <div className="feature-guide__trending">{extraKeys.map((key) => { const feature = features[key]; return <article key={key}><span><Icon name={feature.icon}/></span><div><strong>{feature.title}</strong><p>{feature.description}</p></div></article>; })}</div>
      <div className="feature-guide__actions"><Button variant="secondary" disabled={saving} onClick={() => finish("complete")}>Not now</Button><Button disabled={saving} onClick={() => { setIncludeTrending(true); setIndex(primaryKeys.length); }}>Show popular features <Icon name="arrow" size={16}/></Button></div>
    </CardBody></Card>
  </div>;

  if (!current) return null;
  const total = queue.length;
  const isLast = includeTrending && index === total - 1;
  const recommended = index < primaryKeys.length;
  return <div className="feature-guide">
    <header className="feature-guide__top"><div><Badge tone={recommended ? "brand" : "neutral"}>{recommended ? "Recommended for you" : "Popular feature"}</Badge><h1>Meet {current.title}.</h1><p>{current.description}</p></div><Button variant="ghost" disabled={saving} onClick={() => finish("skip")}>Skip guide</Button></header>
    <Card className="feature-guide__card"><CardBody>
      <div className="feature-guide__progress"><span>Feature {index + 1} of {total}</span><Progress value={((index + 1) / total) * 100}/></div>
      <div className="feature-guide__spotlight"><span className="feature-guide__icon"><Icon name={current.icon} size={28}/></span><div><h2>{current.title}</h2><p>{current.description}</p><ul>{current.tips.map((tip) => <li key={tip}><Icon name="check" size={15}/>{tip}</li>)}</ul></div></div>
      <div className="feature-guide__actions"><Link className="ui-button ui-button--secondary ui-button--md" href={current.href} target="_blank">Open {current.title} <Icon name="arrow" size={15}/></Link><div>{index > 0 ? <Button variant="ghost" disabled={saving} onClick={() => setIndex(index - 1)}>Back</Button> : null}{isLast ? <Button isLoading={saving} onClick={() => finish("complete")}>Finish guide <Icon name="check" size={16}/></Button> : <Button disabled={saving} onClick={() => setIndex(index + 1)}>Next <Icon name="arrow" size={16}/></Button>}</div></div>
    </CardBody></Card>
  </div>;
}
