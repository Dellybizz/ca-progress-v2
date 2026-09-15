"use client";

import { useMemo, useState } from "react";

type TimelineItem = {
  id: number;
  title: string;
  icon: string;
  start: string;
  end: string;
  duration: string;
  tone: string;
  complete?: boolean;
  note?: string;
};

type InboxItem = { id: number; title: string; icon: string; duration: string; tone: string };

const seedTimeline: TimelineItem[] = [
  { id: 1, title: "Rise and Shine", icon: "⏰", start: "08:30", end: "08:45", duration: "15 min", tone: "coral", complete: true },
  { id: 2, title: "Yoga Workout", icon: "⚑", start: "08:45", end: "09:45", duration: "60 min", tone: "blue", note: "19 min remaining" },
  { id: 3, title: "Take a Shower", icon: "♨", start: "10:00", end: "10:15", duration: "15 min", tone: "navy" },
  { id: 4, title: "Have a Coffee", icon: "☕", start: "10:15", end: "10:30", duration: "15 min", tone: "berry" },
  { id: 5, title: "Bike to Office", icon: "♧", start: "10:30", end: "11:00", duration: "30 min", tone: "green" },
  { id: 6, title: "Team Meeting", icon: "●●", start: "11:30", end: "12:30", duration: "1 hr", tone: "coral", note: "3 subtasks" },
];

const seedInbox: InboxItem[] = [
  { id: 101, title: "Do Laundry", icon: "▣", duration: "1 hr", tone: "blue" },
  { id: 102, title: "Do Homework", icon: "▤", duration: "1 hr", tone: "green" },
  { id: 103, title: "Call Grandparents", icon: "●", duration: "30 min", tone: "blue" },
  { id: 104, title: "Go for a Run", icon: "↗", duration: "1 hr", tone: "coral" },
];

const weekdays = [
  ["Mon", "13"], ["Tue", "14"], ["Wed", "15"], ["Thu", "16"], ["Fri", "17"], ["Sat", "18"], ["Sun", "19"],
] as const;

export function DayflowClient() {
  const [timeline, setTimeline] = useState(seedTimeline);
  const [inbox, setInbox] = useState(seedInbox);
  const [activeView, setActiveView] = useState<"inbox" | "timeline" | "ai" | "settings">("timeline");
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("30 min");
  const completed = useMemo(() => timeline.filter((item) => item.complete).length, [timeline]);

  function toggleComplete(id: number) {
    setTimeline((items) => items.map((item) => item.id === id ? { ...item, complete: !item.complete } : item));
  }

  function schedule(item: InboxItem) {
    setInbox((items) => items.filter((entry) => entry.id !== item.id));
    setTimeline((items) => [...items, { ...item, id: Date.now(), start: "12:30", end: "13:00", duration: item.duration }]);
  }

  function addTask() {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setTimeline((items) => [...items, { id: Date.now(), title: cleanTitle, icon: "✦", start: "13:00", end: "13:30", duration, tone: "purple" }]);
    setTitle("");
    setComposerOpen(false);
  }

  return <main className="dayflow-shell">
    <aside className={`dayflow-inbox ${activeView === "inbox" ? "is-mobile-open" : ""}`}>
      <header><button className="dayflow-pill"><span>▣</span>Inbox</button><button className="dayflow-icon-button" aria-label="Close inbox" onClick={() => setActiveView("timeline")}>×</button></header>
      <div className="dayflow-inbox-list">
        {inbox.map((item) => <article key={item.id} className={`dayflow-inbox-item tone-${item.tone}`}>
          <span className="dayflow-inbox-icon">{item.icon}</span><div><small>{item.duration}</small><strong>{item.title}</strong></div><button aria-label={`Schedule ${item.title}`} onClick={() => schedule(item)}>＋</button>
        </article>)}
        {!inbox.length ? <div className="dayflow-inbox-empty"><span>✓</span><strong>Inbox cleared</strong><p>Everything has a place in your day.</p></div> : null}
      </div>
      <button className="dayflow-sidebar-add" onClick={() => setComposerOpen(true)}>＋ Capture task</button>
    </aside>

    <section className="dayflow-workspace">
      <header className="dayflow-topbar">
        <div className="dayflow-date-title"><button aria-label="Previous day">‹</button><h1>16. October <em>2025</em></h1><button aria-label="Next day">›</button></div>
        <div className="dayflow-top-actions"><button>✦ <span>Plan</span></button><button aria-label="Settings">⚙</button></div>
      </header>

      <nav className="dayflow-week" aria-label="Week">
        {weekdays.map(([label, day]) => <button key={day} className={day === "16" ? "is-current" : ""}><span>{label}</span><strong>{day}</strong><i aria-hidden="true"><b/><b/><b/></i></button>)}
      </nav>

      <section className="dayflow-canvas">
        <div className="dayflow-shortcuts">
          <button><span className="tone-green">●</span><strong>Call Mum</strong></button>
          <button><span className="tone-coral">✓</span><strong>Structure<br/>Tomorrow</strong></button>
          <button><span className="tone-yellow">✦</span><strong>Book<br/>Vacation</strong></button>
        </div>

        <div className="dayflow-progress"><span style={{ width: `${Math.max(14, completed / Math.max(1, timeline.length) * 100)}%` }}/></div>
        <div className="dayflow-timeline">
          {timeline.map((item, index) => <article key={item.id} className={`dayflow-event tone-${item.tone} ${item.complete ? "is-complete" : ""}`}>
            <div className="dayflow-time"><span>{item.start}</span>{index === 1 ? <strong>09:41</strong> : null}<span>{item.end}</span></div>
            <div className="dayflow-track"><span className="dayflow-event-icon">{item.icon}</span></div>
            <div className="dayflow-event-copy">{item.note ? <small>{item.note}</small> : <small>{item.start} – {item.end} ({item.duration})</small>}<strong>{item.title}</strong>{item.note === "3 subtasks" ? <em>▣ 1 / 3</em> : null}</div>
            <button className="dayflow-check" aria-label={`${item.complete ? "Reopen" : "Complete"} ${item.title}`} onClick={() => toggleComplete(item.id)}>{item.complete ? "✓" : ""}</button>
          </article>)}
          <button className="dayflow-free-time" onClick={() => setComposerOpen(true)}><span>◷</span><strong>30 min</strong> of free time?</button>
        </div>
      </section>
    </section>

    <nav className="dayflow-mobile-nav" aria-label="App navigation">
      <button className={activeView === "inbox" ? "is-active" : ""} onClick={() => setActiveView("inbox")}><span>▣</span>Inbox</button>
      <button className={activeView === "timeline" ? "is-active" : ""} onClick={() => setActiveView("timeline")}><span>≡</span>Timeline</button>
      <button className={activeView === "ai" ? "is-active" : ""} onClick={() => setActiveView("ai")}><span>✦</span>AI</button>
      <button className={activeView === "settings" ? "is-active" : ""} onClick={() => setActiveView("settings")}><span>⚙</span>Settings</button>
    </nav>
    <button className="dayflow-fab" aria-label="Add task" onClick={() => setComposerOpen(true)}>＋</button>

    {composerOpen ? <div className="dayflow-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setComposerOpen(false); }}>
      <section className="dayflow-composer" role="dialog" aria-modal="true" aria-labelledby="dayflow-add-title">
        <header><div><small>QUICK ADD</small><h2 id="dayflow-add-title">What do you want to do?</h2></div><button aria-label="Close" onClick={() => setComposerOpen(false)}>×</button></header>
        <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addTask(); }} placeholder="e.g. Read for 30 minutes"/>
        <div className="dayflow-composer-options"><label>Duration<select value={duration} onChange={(event) => setDuration(event.target.value)}><option>15 min</option><option>30 min</option><option>45 min</option><option>1 hr</option></select></label><label>Start<select defaultValue="13:00"><option>13:00</option><option>13:30</option><option>14:00</option></select></label></div>
        <footer><button onClick={() => setComposerOpen(false)}>Cancel</button><button className="is-primary" disabled={!title.trim()} onClick={addTask}>Add to timeline</button></footer>
      </section>
    </div> : null}
  </main>;
}
