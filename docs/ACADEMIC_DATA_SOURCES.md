# CA Progress V2 — Academic Data Sources

Phase 3 stores **academic structure metadata only**: level, group, paper/subject titles, chapter/unit titles, syllabus-version applicability and links back to official ICAI sources. It does not copy ICAI study-material chapter text, examples, questions, illustrations or other copyrighted study content.

## Verification contract

- Authority: Institute of Chartered Accountants of India (ICAI), Board of Studies (Academic).
- Scheme: New Scheme of Education and Training.
- Phase 3 verified import date: **30 August 2026**.
- Import mode: `manual_verified_import`.
- Stable IDs are CA Progress-owned identifiers and are not derived from mutable display titles.
- Historical versions are retained. New versions supersede old rows rather than overwriting/deleting them.
- Phase 3 does not scrape ICAI at runtime. Automated re-verification/sync belongs to the later syllabus-data automation phase.

## Primary official references

- New Scheme hub: https://www.icai.org/post/new-scheme-of-education-and-training
- September 2026 Foundation + Intermediate applicable material: https://boslive.icai.org/assets/BOS_Study_Material_applicable_for_Foundation_and_Inter_Sep2026Exam.pdf
- Final November 2026 examination announcement: https://www.icai.org/post/exam300726
- BoS announcements / Final November 2026 material notice: https://boslive.icai.org/bos_announcement.php

## Foundation

Current Phase 3 subject structure:

- Paper 1 — Accounting: https://www.icai.org/post/sm-foundation-paper1
- Paper 2 — Business Laws: https://www.icai.org/post/sm-foundation-paper2
- Paper 3 — Quantitative Aptitude: https://www.icai.org/post/sm-foundation-paper3
- Paper 4 — Business Economics: https://www.icai.org/post/sm-foundation-paper4

The current Foundation material is marked by ICAI as applicable from May 2026 onward. The September 2026 BoS applicability circular confirms the same four papers/material family for that examination.

For version-history verification, Foundation Business Laws retains the earlier **May/September 2025 & January 2026** version and the current **May 2026 onward** version. The current version points to the historical version through `supersedes_version_id`; both retain independent chapter/topic rows.

## Intermediate

The Phase 3 catalog uses the six New Scheme papers:

- Group I: Advanced Accounting; Corporate and Other Laws; Taxation.
- Group II: Cost and Management Accounting; Auditing and Ethics; Financial Management and Strategic Management.

The September 2026 applicability circular is the primary cross-paper source:
https://boslive.icai.org/assets/BOS_Study_Material_applicable_for_Foundation_and_Inter_Sep2026Exam.pdf

Taxation is additionally verified from the paper-specific applicability pages because legislative applicability changes more frequently:

- Income-tax Law: https://www.icai.org/post/bos-int-course-p3-taxation
- GST: https://www.icai.org/post/sm-intermediate-paper3-secb

Those ICAI pages identify the May 2026 / September 2026 / January 2027 applicability window used by the Phase 3 attempt mapping.

## Final

The Phase 3 catalog uses the six New Scheme papers:

- Group I: Financial Reporting; Advanced Financial Management; Advanced Auditing, Assurance and Professional Ethics.
- Group II: Direct Tax Laws & International Taxation; Indirect Tax Laws; Integrated Business Solutions.

Official exam-cycle evidence for the currently staged mapping:

- Final November 2026 examination announcement: https://www.icai.org/post/exam300726
- Final BoS November 2026 material notice: https://boslive.icai.org/bos_announcement.php
- Direct Tax material archive/applicability: https://www.icai.org/post/sm-final-paper4

Integrated Business Solutions is modeled as `case_study` with `special_unit` / `case_component` rows rather than pretending that it has a conventional linear chapter book. ICAI describes Paper 6 as a multidisciplinary case study drawing on core Final papers, Strategic Management and relevant SPOM/case-study material.

## Accounting Standards and other special units

Accounting Standards under Intermediate Advanced Accounting are represented as `topics.topic_kind = 'accounting_standard'` beneath the relevant Accounting Standards chapter group. This keeps standards queryable and stable without adding page-specific arrays or a one-off Accounting Standards table.

Combined papers use `chapters.section_key` to preserve section boundaries such as Income-tax/GST, Financial Management/Strategic Management, and GST/Customs-FTP.

## Attempt mapping scope

`attempt_syllabus_map` is an applicability relationship, not an exam-countdown calendar. Phase 3 maps syllabus versions only to attempts verified/represented by the applicable ICAI academic material used during the import. Later scheduling/countdown logic must consume the authoritative attempt engine rather than infer examination frequency from these rows.

## Change-management rules

1. Never update a historical syllabus version in place merely because ICAI publishes a new version.
2. Add a new `syllabus_versions` row, set effective dates/status, and use `supersedes_version_id`.
3. Create new chapter/topic rows under that version with stable CA Progress IDs.
4. Update applicable-attempt relationships explicitly.
5. Keep the old version and rows addressable so later student-history tables can continue referencing immutable IDs.
6. Academic client surfaces remain read-only in Phase 3; writes are migration/service-role operations only.
