# CA Progress V2 Design System - Phase 1

## Purpose
Phase 1 establishes the reusable UX language before feature logic is connected. The old CA Progress UI is reference-only and is not copied into V2.

## Token layers
The CSS token layer defines typography, spacing, responsive page gutters for 360/375/390/430 and desktop, radii, elevation, semantic brand/success/warning/danger/info colors, focus rings, 44px minimum interactive targets, light tokens plus dark-mode-ready overrides, accent/density hooks and reduced-motion behavior.

## Core primitives
The Phase 1 UI library in `components/ui/` includes Button, Input, Select, Tabs, Card, Modal, Drawer, BottomSheet, Toast, Badge, Skeleton, EmptyState and Progress, plus shared Icon and PageHeader helpers. Modal/Drawer/BottomSheet support Escape-to-close and accessible dialog semantics. Tabs support Arrow, Home and End navigation.

## Shell contracts
Desktop uses a dedicated sidebar + topbar information architecture. Mobile uses a separate bottom-navigation design with a More bottom sheet rather than compressing the desktop sidebar. Command search and notifications are UI contracts only in Phase 1.

## Main route previews
High-fidelity mock surfaces exist for `/dashboard`, `/planner`, `/progress`, `/study`, `/tests`, `/notes`, `/resources`, `/community`, `/settings`, `/admin`, `/login` and `/onboarding`. Mock values are presentation-only; persistent business logic remains in later phases.

## Preference contract
`lib/preferences/contract.ts` and `user_preferences` define the future appearance contract: theme `system/light/dark`, accent `indigo/violet/emerald/rose`, density `comfortable/compact`, and reduce-motion. Authentication/profile integration does not begin until Phase 2, so Phase 1 does not read/write preference rows from the UI.
