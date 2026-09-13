const freeze = (value) => Object.freeze(value);

export const refinementR1 = freeze({
  schemaVersion: 1,
  programme: "CA Progress Refinement and Launch Programme",
  phase: "R1",
  visualThesis: "Educational clarity inside a restrained, precise study workspace.",
  references: freeze({
    quizlet: freeze({ owns: ["study hierarchy", "learning states", "progress language"], reject: ["promotional density", "excessive gamification"] }),
    amie: freeze({ owns: ["calm workspace hierarchy", "paired actions", "flat surfaces"], reject: ["oversized marketing type", "decorative colour"] }),
    todoist: freeze({ owns: ["today-first planning", "quick capture", "completion states"], reject: ["brand imitation", "loss of academic context"] }),
    goodnotes: freeze({ owns: ["focused notes canvas", "touch workspace", "tool discipline"], reject: ["desktop editor chrome on phones", "brand imitation"] }),
    dub: freeze({ owns: ["analytics hierarchy", "compact filters", "scannable metrics"], reject: ["link-product metaphors", "decorative charts"] }),
    linear: freeze({ owns: ["admin density", "tables", "search and keyboard rigor"], reject: ["developer tone", "tiny touch targets", "near-black dominance"] }),
  }),
  targets: freeze({
    touchTargetPx: 44,
    compactPhoneWidthPx: 360,
    standardPhoneWidthPx: 390,
    desktopWidthPx: 1440,
    maxHorizontalApplicationOverflowPx: 0,
    minimumBodyTextPx: 15,
    reducedMotionRequired: true,
    keyboardReachabilityRequired: true,
  }),
  mobileActions: freeze(["keep", "condense", "move", "defer", "merge", "remove on mobile"]),
  primaryMobileNavigation: freeze(["Home", "Today", "Study", "Progress", "More"]),
  antiPatterns: freeze([
    "desktop layouts compressed into one long mobile page",
    "duplicate destinations across page shortcuts, bottom navigation and drawers",
    "card-inside-card composition",
    "oversized headings before the primary task",
    "decorative gradients, glass effects or charts",
    "wide tables hidden or horizontally scrolled without a detail path",
    "desktop dialogs shrunk for mobile",
  ]),
});

