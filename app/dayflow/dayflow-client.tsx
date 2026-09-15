"use client";

import { useMemo, useState } from "react";

type Mode = "day" | "multi" | "week" | "month";
type MobileView = "inbox" | "timeline" | "plan" | "settings";
type Tone = "coral" | "blue" | "green" | "navy" | "berry";

type StudyItem = {
  id: number;
  subject: string;
  title: string;
  start: string;
  end: string;
  duration: string;
  tone: Tone;
  icon: string;
  complete?: boolean;
  repeat?: string;
  note?: string;
};

type InboxItem = Pick<StudyItem, "id" | "subject" | "title" | "duration" | "tone" | "icon">;

const initialTimeline: StudyItem[] = [
  { id: 1, subject: "Advanced Accounting", title: "Accounting Standards · Revision 1", start: "08:30", end: "09:15", duration: "45 min", tone: "coral", icon: "AS", complete: true, repeat: "Weekdays" },
  { id: 2, subject: "Advanced Accounting", title: "Amalgamation · Question practice", start: "09:15", end: "10:15", duration: "1 hr", tone: "blue", icon: "AQ", note: "19 min remaining" },
  { id: 3, subject: "Corporate Law", title: "Company incorporation", start: "10:30", end: "11:00", duration: "30 min", tone: "navy", icon: "§" },
  { id: 4, subject: "Taxation", title: "GST revision", start: "11:00", end: "11:45", duration: "45 min", tone: "berry", icon: "%" },
  { id: 5, subject: "Audit", title: "Chapter notes", start: "12:00", end: "12:30", duration: "30 min", tone: "green", icon: "AN" },
  { id: 6, subject: "Costing", title: "Chapter test", start: "13:00", end: "14:00", duration: "1 hr", tone: "coral", icon: "T1", note: "3 sections" },
];

const initialInbox: InboxItem[] = [
  { id: 101, subject: "ICAI", title: "Review revision notes", duration: "30 min", tone: "blue", icon: "RN" },
  { id: 102, subject: "Corporate Law", title: "Complete pending questions", duration: "1 hr", tone: "green", icon: "PQ" },
  { id: 103, subject: "Revision", title: "Revisit mistake journal", duration: "30 min", tone: "navy", icon: "MJ" },
  { id: 104, subject: "Taxation", title: "Take a mock test", duration: "1 hr", tone: "coral", icon: "T2" },
];

const week = [
  ["Sun", "13"], ["Mon", "14"], ["Tue", "15"], ["Wed", "16"], ["Thu", "17"], ["Fri", "18"], ["Sat", "19"],
] as const;

const monthDays = Array.from({ length: 35 }, (_, index) => index < 2 ? 30 + index : index - 1);

export function DayflowClient() {
  const [timeline, setTimeline] = useState(initialTimeline);
  const [inbox, setInbox] = useState(initialInbox);
  const [mode, setMode] = useState<Mode>("day");
  const [mobileView, setMobileView] = useState<MobileView>("timeline");
  const [selected, setSelected] = useState<StudyItem | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [capture, setCapture] = useState("");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("30 min");

  const completed = useMemo(() => timeline.filter((item) => item.complete).length, [timeline]);
  const completion = Math.round((completed / Math.max(1, timeline.length)) * 100);

  function toggleComplete(id: number) {
    setTimeline((items) => items.map((item) => item.id === id ? { ...item, complete: !item.complete } : item));
    setSelected((item) => item?.id === id ? { ...item, complete: !item.complete } : item);
  }

  function schedule(item: InboxItem) {
    setInbox((items) => items.filter((entry) => entry.id !== item.id));
    setTimeline((items) => [...items, { ...item, id: Date.now(), start: "12:30", end: "13:00" }]);
    setMobileView("timeline");
  }

  function captureTask() {
    const clean = capture.trim();
    if (!clean) return;
    setInbox((items) => [{ id: Date.now(), subject: "Unscheduled", title: clean, duration: "30 min", tone: "blue", icon: "＋" }, ...items]);
    setCapture("");
  }

  function addTask() {
    const clean = title.trim();
    if (!clean) return;
    setTimeline((items) => [...items, { id: Date.now(), subject: "Self study", title: clean, start: "14:15", end: "14:45", duration, tone: "blue", icon: "ST" }]);
    setTitle("");
    setComposerOpen(false);
  }

  return <main className="dayflow-shell">
    <aside className={"dayflow-inbox " + (mobileView === "inbox" ? "is-mobile-open" : "")}>
      <header>
        <button className="dayflow-pill"><span>□</span> Study Inbox <b>{inbox.length}</b></button>
        <button className="dayflow-icon-button" aria-label="Close inbox" onClick={() => setMobileView("timeline")}>×</button>
      </header>
      <div className="dayflow-capture">
        <input value={capture} onChange={(event) => setCapture(event.target.value)} onKeyDown={(event) => event.key === "Enter" && captureTask()} placeholder="Capture an unscheduled task…" />
        <button aria-label="Add inbox task" disabled={!capture.trim()} onClick={captureTask}>＋</button>
      </div>
      <div className="dayflow-inbox-list">
        {inbox.map((item) => <article key={item.id} className={"dayflow-inbox-item tone-" + item.tone}>
          <span className="dayflow-inbox-icon">{item.icon}</span>
          <div><small>{item.subject} · {item.duration}</small><strong>{item.title}</strong></div>
          <button aria-label={"Schedule " + item.title} onClick={() => schedule(item)}>＋</button>
        </article>)}
        {!inbox.length && <div className="dayflow-inbox-empty"><span>✓</span><strong>Inbox cleared</strong><p>Everything has a place in your study day.</p></div>}
      </div>
      <div className="dayflow-inbox-note"><span>↕</span><p><strong>Unscheduled first.</strong> Capture quickly, decide the time later.</p></div>
    </aside>

    <section className="dayflow-workspace">
      <header className="dayflow-topbar">
        <div className="dayflow-date-title">
          <button aria-label="Previous day">‹</button>
          <button className="dayflow-month-title"><small>INTERMEDIATE · BOTH GROUPS · JAN 2027</small><strong>September <em>2026</em></strong></button>
          <button aria-label="Next day">›</button>
        </div>
        <nav className="dayflow-mode-switcher" aria-label="Timeline view">
          {(["day", "multi", "week", "month"] as Mode[]).map((view) => <button key={view} className={mode === view ? "is-active" : ""} onClick={() => setMode(view)}>{view === "multi" ? "Multi-Day" : view[0].toUpperCase() + view.slice(1)}</button>)}
        </nav>
        <div className="dayflow-top-actions"><button aria-label="Multi select">✓</button><button aria-label="Study settings" onClick={() => setMobileView("settings")}>⚙</button></div>
      </header>

      <nav className="dayflow-week" aria-label="Week">
        {week.map(([label, day]) => <button key={day} className={day === "15" ? "is-current" : ""}><span>{label}</span><strong>{day}</strong><i aria-hidden="true"><b /><b /></i></button>)}
      </nav>

      <section className={"dayflow-canvas mode-" + mode}>
        {mode === "month" ? <MonthView /> : mode === "week" || mode === "multi" ? <MultiView mode={mode} timeline={timeline} onSelect={setSelected} /> : <DayView timeline={timeline} completion={completion} onComplete={toggleComplete} onSelect={setSelected} onAdd={() => setComposerOpen(true)} />}
      </section>
    </section>

    <nav className="dayflow-mobile-nav" aria-label="Study Flow navigation">
      <button className={mobileView === "inbox" ? "is-active" : ""} onClick={() => setMobileView("inbox")}><span>□</span>Inbox</button>
      <button className={mobileView === "timeline" ? "is-active" : ""} onClick={() => setMobileView("timeline")}><span>│</span>Timeline</button>
      <button className={mobileView === "plan" ? "is-active" : ""} onClick={() => setComposerOpen(true)}><span>✦</span>Plan</button>
      <button className={mobileView === "settings" ? "is-active" : ""} onClick={() => setMobileView("settings")}><span>⚙</span>Settings</button>
    </nav>
    <button className="dayflow-fab" aria-label="Add study task" onClick={() => setComposerOpen(true)}>＋</button>

    {selected && <div className="dayflow-drawer-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setSelected(null)}>
      <aside className={"dayflow-task-drawer tone-" + selected.tone} aria-label="Study task details">
        <header><button aria-label="Close task editor" onClick={() => setSelected(null)}>×</button><button aria-label="Task menu">•••</button></header>
        <div className="dayflow-task-title"><span>{selected.icon}</span><div><small>{selected.subject}</small><h2>{selected.title}</h2></div></div>
        <button className="dayflow-complete-action" onClick={() => toggleComplete(selected.id)}><i>{selected.complete ? "✓" : ""}</i>{selected.complete ? "Completed" : "Mark complete"}</button>
        <dl>
          <div><dt>Date</dt><dd>Today, Tue, Sep 15</dd></div>
          <div><dt>Time</dt><dd>{selected.start} – {selected.end} · {selected.duration}</dd></div>
          <div><dt>Repeat</dt><dd>{selected.repeat || "Does not repeat"}</dd></div>
          <div><dt>Plan</dt><dd>Intermediate · January 2027</dd></div>
        </dl>
        <label>Notes<textarea defaultValue={selected.note || ""} placeholder="Add notes, question targets or a meeting link…" /></label>
        <button className="dayflow-save">Update task</button>
      </aside>
    </div>}

    {mobileView === "settings" && <div className="dayflow-modal-backdrop"><section className="dayflow-settings" role="dialog" aria-modal="true" aria-label="Study Flow settings"><header><div><small>STUDY FLOW</small><h2>View settings</h2></div><button aria-label="Close settings" onClick={() => setMobileView("timeline")}>×</button></header><label><span>Show current time</span><input type="checkbox" defaultChecked /></label><label><span>Smart study icons</span><input type="checkbox" defaultChecked /></label><label><span>Compact completed sessions</span><input type="checkbox" /></label><button onClick={() => setMobileView("timeline")}>Done</button></section></div>}

    {composerOpen && <div className="dayflow-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setComposerOpen(false)}>
      <section className="dayflow-composer" role="dialog" aria-modal="true" aria-labelledby="dayflow-add-title">
        <header><div><small>ADD TO TIMELINE</small><h2 id="dayflow-add-title">What will you study?</h2></div><button aria-label="Close" onClick={() => setComposerOpen(false)}>×</button></header>
        <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addTask()} placeholder="e.g. Revise Accounting Standards" />
        <div className="dayflow-composer-options"><label>Duration<select value={duration} onChange={(event) => setDuration(event.target.value)}><option>15 min</option><option>30 min</option><option>45 min</option><option>1 hr</option></select></label><label>Start<select defaultValue="14:15"><option>14:15</option><option>14:30</option><option>15:00</option></select></label></div>
        <footer><button onClick={() => setComposerOpen(false)}>Cancel</button><button className="is-primary" disabled={!title.trim()} onClick={addTask}>Add to timeline</button></footer>
      </section>
    </div>}
  </main>;
}

function DayView({ timeline, completion, onComplete, onSelect, onAdd }: { timeline: StudyItem[]; completion: number; onComplete: (id: number) => void; onSelect: (item: StudyItem) => void; onAdd: () => void }) {
  return <>
    <div className="dayflow-day-summary"><div><strong>Today</strong><span>{timeline.length} sessions · 4h 00m</span></div><div><strong>{completion}%</strong><span>planned work complete</span></div></div>
    <div className="dayflow-progress"><span style={{ width: completion + "%" }} /></div>
    <div className="dayflow-timeline">
      {timeline.map((item, index) => <article key={item.id} className={"dayflow-event tone-" + item.tone + (item.complete ? " is-complete" : "")}>
        <div className="dayflow-time"><span>{item.start}</span>{index === 1 && <strong>09:41</strong>}<span>{item.end}</span></div>
        <button className="dayflow-track" aria-label={"Edit " + item.title} onClick={() => onSelect(item)}><span className="dayflow-event-icon">{item.icon}</span></button>
        <button className="dayflow-event-copy" onClick={() => onSelect(item)}><small>{item.note || item.start + " – " + item.end + " · " + item.duration}</small><strong>{item.title}</strong><em>{item.subject}</em></button>
        <button className="dayflow-check" aria-label={(item.complete ? "Reopen " : "Complete ") + item.title} onClick={() => onComplete(item.id)}>{item.complete ? "✓" : ""}</button>
      </article>)}
      <button className="dayflow-free-time" onClick={onAdd}><span>＋</span><strong>15 min</strong> gap before the next session</button>
    </div>
  </>;
}

function MultiView({ mode, timeline, onSelect }: { mode: Mode; timeline: StudyItem[]; onSelect: (item: StudyItem) => void }) {
  const columns = mode === "multi" ? 4 : 7;
  return <div className="dayflow-columns" style={{ gridTemplateColumns: `repeat(${columns}, minmax(120px, 1fr))` }}>
    {Array.from({ length: columns }, (_, day) => <section key={day}><header><span>{week[day][0]}</span><strong>{week[day][1]}</strong></header><div className="dayflow-hours"><small>8 AM</small><small>10 AM</small><small>12 PM</small><small>2 PM</small></div>{timeline.slice(0, day === 2 ? 4 : 2).map((item, index) => <button key={item.id} className={"dayflow-column-event tone-" + item.tone} style={{ top: 56 + index * 92 }} onClick={() => onSelect(item)}><i>{item.icon}</i><span><strong>{item.title}</strong><small>{item.start}</small></span></button>)}</section>)}
  </div>;
}

function MonthView() {
  return <div className="dayflow-month-grid">{monthDays.map((day, index) => <button key={index} className={day === 15 ? "is-today" : ""}><strong>{index === 0 ? "Aug 30" : index === 33 ? "Oct 1" : day}</strong>{index > 1 && <span><i className="tone-coral">AS</i>Revision <small>8:30</small></span>}{index > 13 && <span><i className="tone-blue">Q</i>Questions <small>9:15</small></span>}</button>)}</div>;
}
