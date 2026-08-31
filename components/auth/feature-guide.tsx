"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { primaryUseOptions, type PrimaryUse } from "@/lib/profile/onboarding";

type Feature = {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: IconName;
  tips: string[];
  selectors: string[];
};

type SpotlightRect = { top: number; left: number; width: number; height: number };

const features: Record<string, Feature> = {
  today: { key: "today", title: "Today Plan", description: "See the study work that matters today and keep your day realistic.", href: "/planner/today", icon: "sparkles", tips: ["Start with today's priorities", "Keep planned minutes realistic", "Mark work complete as you go"], selectors: [".dashboard-today-card", ".mobile-bottom-nav a[href='/planner/today']"] },
  planner: { key: "planner", title: "Planner", description: "Build and adjust study, revision and test tasks around your attempt.", href: "/planner", icon: "calendar", tips: ["Add your own tasks", "Connect work to subjects and chapters", "Use forecast and goals when you need a longer view"], selectors: [".desktop-sidebar a[href='/planner']", ".dashboard-today-card a[href='/planner']", ".mobile-bottom-nav button[aria-label='More navigation']"] },
  progress: { key: "progress", title: "Progress tracker", description: "Track completion, two revisions and two test stages without losing history.", href: "/progress", icon: "chart", tips: ["Update a stage with one tap", "Filter by subject or group", "Open analytics when you want the bigger picture"], selectors: [".dashboard-progress-card", ".mobile-bottom-nav a[href='/progress']"] },
  revision: { key: "revision", title: "Revision settings", description: "Tune how CA Progress spaces revision work around your study routine.", href: "/planner/revision-settings", icon: "settings", tips: ["Choose revision intervals", "Set preferred weekdays", "Keep the plan aligned with your available time"], selectors: [".desktop-sidebar a[href='/planner/revision-settings']", ".mobile-bottom-nav button[aria-label='More navigation']"] },
  study: { key: "study", title: "Study mode", description: "Run focused study sessions with targets, pause/resume and saved study history.", href: "/study", icon: "timer", tips: ["Start a focused session", "Attach a subject or chapter", "Use your streak as feedback, not pressure"], selectors: [".dashboard-study-card", ".mobile-bottom-nav a[href='/study']"] },
  calendar: { key: "calendar", title: "Calendar", description: "See study tasks, revision work and important dates in one time-based view.", href: "/calendar", icon: "calendar", tips: ["Review busy days early", "Balance study and test work", "Use it alongside your daily plan"], selectors: [".desktop-sidebar a[href='/calendar']", ".mobile-bottom-nav button[aria-label='More navigation']"] },
  updates: { key: "updates", title: "ICAI Updates", description: "Follow verified updates relevant to your level, attempt and subjects.", href: "/updates", icon: "bell", tips: ["Open the official source when needed", "Check applicability before acting", "Use Syllabus for the academic structure"], selectors: [".dashboard-icai-card", ".desktop-sidebar a[href='/updates']", ".mobile-bottom-nav button[aria-label='More navigation']"] },
  syllabus: { key: "syllabus", title: "Syllabus", description: "Browse your verified level, group, subjects and chapter structure.", href: "/syllabus", icon: "book", tips: ["Open a subject to see its structure", "Use attempt-aware academic data", "Keep official-source context close by"], selectors: [".desktop-sidebar a[href='/syllabus']", ".mobile-bottom-nav button[aria-label='More navigation']"] },
  tests: { key: "tests", title: "Tests", description: "Keep test work connected to your chapter progress and revision state.", href: "/tests", icon: "tests", tips: ["Track Test 1 and Test 2 stages", "Use progress to spot weak coverage", "Plan test work before exam-heavy weeks"], selectors: [".desktop-sidebar a[href='/tests']", ".dashboard-progress-card", ".mobile-bottom-nav button[aria-label='More navigation']"] },
  community: { key: "community", title: "Community", description: "Use general, level and subject spaces without losing academic context.", href: "/community", icon: "community", tips: ["Ask subject-specific doubts", "Follow announcements and replies", "Keep discussions connected to your CA level"], selectors: [".desktop-sidebar a[href='/community']", ".mobile-bottom-nav button[aria-label='More navigation']"] },
  resources: { key: "resources", title: "Resources", description: "Keep your notes, files and approved shared study resources organized.", href: "/resources", icon: "book", tips: ["Keep private uploads private", "Use approved shared resources", "Find ICAI resources from official sources"], selectors: [".desktop-sidebar a[href='/resources']", ".mobile-bottom-nav button[aria-label='More navigation']"] },
  notes: { key: "notes", title: "Notes", description: "Create private study notes and connect them to subjects or chapters.", href: "/notes", icon: "notes", tips: ["Keep quick revision notes", "Tag notes for easier retrieval", "Connect notes to the chapter you are studying"], selectors: [".desktop-sidebar a[href='/notes']", ".mobile-bottom-nav button[aria-label='More navigation']"] },
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

function uniqueKeys(keys: string[]) { return [...new Set(keys)]; }
function visibleElement(selector: string) {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return elements.find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }) ?? null;
}

export function FeatureGuide({ priorities, next }: { priorities: PrimaryUse[]; next: string }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [includeOthers, setIncludeOthers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);

  const primaryKeys = useMemo(() => uniqueKeys(priorities.flatMap((priority) => focusTours[priority])), [priorities]);
  const extraKeys = useMemo(() => {
    const unselected = primaryUseOptions.map((option) => option.key).filter((key) => !priorities.includes(key));
    return uniqueKeys([...unselected.flatMap((priority) => focusTours[priority]), ...trendingKeys]).filter((key) => !primaryKeys.includes(key));
  }, [priorities, primaryKeys]);
  const queue = includeOthers ? [...primaryKeys, ...extraKeys] : primaryKeys;
  const atOtherPrompt = !includeOthers && index >= primaryKeys.length;
  const current = !atOtherPrompt ? features[queue[index]] : null;

  useEffect(() => {
    if (!current) { setSpotlight(null); return; }
    let scrollTimer = 0;
    const sync = () => {
      const target = current.selectors.map(visibleElement).find(Boolean) ?? null;
      if (!target) { setSpotlight(null); return; }
      const rect = target.getBoundingClientRect();
      setSpotlight({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };
    const timer = window.setTimeout(() => {
      const target = current.selectors.map(visibleElement).find(Boolean) ?? null;
      if (target) target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      scrollTimer = window.setTimeout(sync, 280);
    }, 40);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(scrollTimer);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [current]);

  async function finish(action: "complete" | "skip") {
    setSaving(true);
    const response = await fetch("/api/onboarding/guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    setSaving(false);
    if (!response.ok) return;
    router.push(next);
    router.refresh();
  }

  if (atOtherPrompt) {
    return <div className="dashboard-tour dashboard-tour--prompt" role="dialog" aria-modal="true" aria-label="Feature guide">
      <div className="dashboard-tour__backdrop"/>
      <div className="dashboard-tour__prompt-card">
        <Badge tone="brand">Quick guide</Badge>
        <h2>Want a tour of other useful features too?</h2>
        <p>You have seen the tools that match your priorities first. You can stop here or continue through the remaining popular features on the same dashboard.</p>
        <div className="dashboard-tour__other-list">{extraKeys.slice(0, 6).map((key) => <span key={key}><Icon name={features[key].icon} size={16}/>{features[key].title}</span>)}</div>
        <div className="dashboard-tour__prompt-actions"><Button variant="secondary" disabled={saving} onClick={() => finish("complete")}>Not now</Button><Button disabled={saving || !extraKeys.length} onClick={() => { setIncludeOthers(true); setIndex(primaryKeys.length); }}>Tour other features <Icon name="arrow" size={16}/></Button></div>
      </div>
    </div>;
  }

  if (!current) return null;
  const total = queue.length;
  const isLast = includeOthers && index === total - 1;
  const recommended = index < primaryKeys.length;

  return <div className="dashboard-tour" role="dialog" aria-modal="true" aria-label={`Guide to ${current.title}`}>
    {spotlight ? <div className="dashboard-tour__spotlight" style={{ top: Math.max(6, spotlight.top - 7), left: Math.max(6, spotlight.left - 7), width: spotlight.width + 14, height: spotlight.height + 14 }} aria-hidden="true"/> : <div className="dashboard-tour__backdrop"/>}
    <aside className="dashboard-tour__panel">
      <div className="dashboard-tour__panel-top"><Badge tone={recommended ? "brand" : "neutral"}>{recommended ? "Recommended for you" : "More to explore"}</Badge><button type="button" disabled={saving} onClick={() => finish("skip")}>Skip guide</button></div>
      <div className="dashboard-tour__progress"><span>Feature {index + 1} of {total}</span><Progress value={((index + 1) / total) * 100}/></div>
      <div className="dashboard-tour__feature"><span className="dashboard-tour__icon"><Icon name={current.icon} size={24}/></span><div><h2>{current.title}</h2><p>{current.description}</p></div></div>
      <ul>{current.tips.map((tip) => <li key={tip}><Icon name="check" size={14}/>{tip}</li>)}</ul>
      <p className="dashboard-tour__hint">The highlighted area is the real dashboard or navigation control, so you can see exactly where the feature lives while the guide stays open.</p>
      <div className="dashboard-tour__actions">{index > 0 ? <Button variant="secondary" disabled={saving} onClick={() => setIndex(index - 1)}>Back</Button> : <span/>}{isLast ? <Button isLoading={saving} onClick={() => finish("complete")}>Finish guide <Icon name="check" size={16}/></Button> : <Button disabled={saving} onClick={() => setIndex(index + 1)}>Next <Icon name="arrow" size={16}/></Button>}</div>
    </aside>
  </div>;
}
