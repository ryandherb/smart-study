# Graphite design system

Status: approved visual direction, October 29, 2026. This document guides the redesign of the existing app. Start with the study screen, then apply the same system to the library, homework, and summaries.

## Design intent

Create a precise, modern workspace for long study sessions. Use cool graphite surfaces, readable text, compact navigation, and generous space for questions and answers. Blue, green, and yellow accents should look vibrant against the neutral surfaces.

The approved direction is dark first. Preserve the existing light-mode option during integration; a complete light palette still needs to be designed and reviewed.

### Core principles

- The question and answer are the visual center of the screen.
- Navigation is compact; reading and writing areas are comfortable and spacious.
- Use color deliberately for actions, selection, and feedback.
- Keep surfaces opaque, flat, and visually stable.
- Repeat a small set of spacing, typography, and component rules throughout the app.
- Preserve tutoring behavior, accessibility, and access to existing features.

## Color tokens

These are the approved colors from the final mockup. The brighter accents replace the earlier muted palette.

```css
--study-bg: #14171b;          /* App shell, sidebar, answer editor */
--study-surface: #1b1f24;     /* Main reading and writing surface */
--study-raised: #232830;      /* Selected rows, hover surfaces, raised controls */
--study-line: #343c46;        /* Structural dividers and control borders */

--study-text: #e4e8ee;        /* Primary text */
--study-muted: #a7b1be;       /* Supporting text and metadata */

--study-accent: #4d9fff;      /* Vibrant blue: primary action, current topic, focus */
--study-success: #35e69b;     /* Vibrant green: correct answers and completed topics */
--study-warning: #ffd34d;     /* Vibrant yellow: partial answers and attention states */
--study-on-accent: #13243d;   /* Text and icons on filled blue buttons */
```

### Color application

- Use blue on the main action, current-topic indicator, question number, focus rings, and links.
- Use green for success labels and completion icons.
- Use yellow for partial-answer feedback and warnings that need attention.
- Keep ordinary text neutral, including most feedback explanations.
- Use neutral selected-row backgrounds with a colored icon; avoid filling whole sections with saturated color.
- Pair every status color with a text label or recognizable icon.
- Incorrect-answer and destructive-action red was not shown in the approved mockup. Define a semantic danger token during implementation and review it alongside these accents.
- Use semantic tokens rather than scattering literal color values across components.

Approximate contrast ratios for the approved pairings: blue text on the reading surface 6.09:1; green on the app background 11.08:1; yellow on the reading surface 11.57:1; dark button text on blue 5.73:1. Validate additional states and backgrounds independently, especially disabled controls and syntax highlighting.

## Typography

Use one sans-serif family for the interface and prose. Keep monospace for code and keyboard shortcuts.

```css
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "SFMono-Regular", Consolas, monospace;
```

Inter is currently named in the app styles but is not loaded by the HTML entry point. Choose a deliberate font-loading strategy or accept the system fallback; do not assume the font declaration downloads it.

- Question and explanation prose: 17px, line height approximately 1.7.
- Answer editor: 16px, line height approximately 1.65.
- Code editor: start at 15px and check long examples.
- General interface text: 14px.
- Topic navigation and action labels: 13px.
- Metadata: 12px.
- Uppercase section labels: 11px, medium weight, approximately 1.2px letter spacing. Use sparingly and never for essential reading content.
- Main question heading: 26px desktop, 24px narrow screens, medium weight, approximately 1.25 line height.
- Use regular and medium weights for most text; reserve semibold for compact branding and primary actions.
- Use tabular figures for changing timers and aligned numeric values.

Keep prose around 65–75 characters per line when space allows. Use a maximum content width of approximately 650px; code and source material can use additional width when necessary.

## Spacing and geometry

- Spacing scale: 4, 8, 12, 16, 24, 32, and 48px. Small optical adjustments are acceptable.
- Controls and selected navigation rows: 6px corner radius.
- Answer editor: 8px corner radius.
- Larger bounded surfaces: up to 10px corner radius.
- Borders: 1px, using the structural line token.
- Main action height: approximately 40px; ensure effective touch targets are at least 44px on touch devices.
- Compact secondary controls: approximately 34px on desktop, with adequate spacing and larger touch targets.
- Main content padding: approximately 30px vertically and 42px horizontally on desktop; 20–24px on narrow screens.

Avoid gradients, translucent glass effects, decorative shadows, large pill shapes, and nested card containers. Establish hierarchy through placement, spacing, typography, and subtle surface changes.

## Study-screen composition

### Header

A quiet horizontal header contains the app identity, study-set title, and secondary session information. Use a structural bottom divider. Keep timers and supporting controls visually subordinate to the study content. Preserve access to the library, theme control, source material, and tutor questions.

### Topic sidebar

- Approximately 208–240px wide on desktop.
- Neutral background with a divider separating it from the reading surface.
- Small section label, followed by compact topic rows.
- Current topic: raised neutral background, blue indicator, readable primary text.
- Completed topic: green completion icon, neutral label.
- Pending and paused topics must have distinguishable labels or icons.
- Show a small completion summary and thin progress track below the list.
- Keep topics navigable and preserve their existing jump/resume behavior.

### Main workspace

- Use one continuous reading surface rather than wrapping every section in a card.
- Place topic context and a compact source control above the question.
- Show a small blue question number, then the heading and question text.
- Follow with a clearly labeled answer area and its actions.
- Keep source references and mode information in a quiet supporting row.
- Show optional source/tutor panels only when requested, without compressing the question below a comfortable reading width.

### Responsive behavior

The mockup's desktop sidebar disappears on narrow screens. In the real app, retain a topic picker or accessible drawer so topic switching remains available. Reflow controls rather than letting labels overlap or clip. At small widths, source and tutor panels should use an accessible drawer or stacked view.

When three columns no longer fit, collapse secondary regions before squeezing the main editor. Preserve reading position, entered answers, and focus when panels open or close.

## Component rules

### Buttons

- Primary: vibrant blue fill with dark text; one main action per action group.
- Secondary: transparent or neutral surface with a subtle border and primary text.
- Quiet action: supporting text with no persistent container; readable hover and focus states.
- Provide explicit hover, keyboard focus, disabled, and busy states.
- Keep labels concrete: “Check answer,” “Revise your answer,” “Continue,” and “Source.”
- Keep keyboard shortcuts working and document them where useful.

### Answer input

- Use the app-background token inside the main reading surface.
- Apply a subtle border, 8px radius, and approximately 16px internal padding.
- Keep the label above the editor; do not rely on placeholder text as the label.
- Text responses should start around 158px tall and expand or resize appropriately.
- Apply the same surface and focus language to text, numeric, multiple-choice, and code responses.
- Preserve drafts, code editing, test execution, validation, and submission behavior.

### Feedback

- Place feedback after the answer, using spacing and a thin divider for separation.
- Use a small status icon and concise status text in green, yellow, or the reviewed danger color.
- Keep the explanation on a neutral surface with normal prose styling.
- Make the next action clear: revise, continue, or try an easier step.
- Preserve the distinction between correct, partial, incorrect, retry, and scaffold states.
- Do not use large saturated background panels or animated celebrations.

### Sources, code, and math

- Use a compact, labeled source control and a readable page citation.
- Source excerpts can use a subtle blue leading rule and neutral background.
- Retain the existing PDF viewer, page navigation, and question-to-source links.
- Keep syntax highlighting readable in both themes; avoid a fixed dark code surface inside light mode without deliberate review.
- Check inline math, display equations, tables, long filenames, and long code lines. Confine necessary horizontal scrolling to the content that needs it.

### Usage and progress

- Keep normal usage information compact, with details available on demand.
- Preserve account-wide limit information and clearly visible actionable warnings.
- Do not remove functionality when simplifying the existing usage footer.
- Keep session timing and topic progress subordinate to the question.

### Motion and accessibility

- Prefer brief color and opacity changes, approximately 120–180ms.
- Avoid spring-based entrances, bouncing indicators, pulsing decorations, and layout shifts during reading.
- Respect reduced-motion preferences.
- Provide visible keyboard focus, labels for icon-only controls, and meaningful status text.
- Announce grading and validation results appropriately without repeatedly announcing background updates.
- Support text enlargement and narrow windows without losing essential actions.

## Integration plan

This is a presentation redesign. Preserve existing study state, server behavior, and model-call costs.

### 1. Establish shared foundations

- [ ] Add the semantic color, spacing, and radius tokens in `web/src/index.css`.
- [ ] Replace the aurora app background, glass card treatment, and colored shadows with the approved surfaces.
- [ ] Update shared buttons, theme control, keyboard labels, and loading indicators in `web/src/components/ui.tsx`.
- [ ] Align prose, code, and math rendering in `web/src/components/Markdown.tsx` and the shared stylesheet.
- [ ] Keep light-mode behavior intact and review its palette separately.

### 2. Redesign the study screen first

- [ ] Update the shell, header, content widths, and optional panel behavior in `web/src/pages/Study.tsx`.
- [ ] Update topic navigation and progress in `web/src/components/TopicRail.tsx`.
- [ ] Simplify question framing and metadata in `web/src/components/QuestionCard.tsx`.
- [ ] Apply editor and action rules in `web/src/components/AnswerInput.tsx`.
- [ ] Apply neutral feedback composition in `web/src/components/FeedbackCard.tsx`.
- [ ] Align scaffolding, references, tests, and side panels in their existing components.
- [ ] Simplify `web/src/components/UsageBar.tsx` while retaining limits, details, and warnings.

### 3. Extend the system to remaining screens

- [ ] Apply the same typography, surfaces, actions, and spacing to `web/src/pages/Library.tsx`.
- [ ] Update study-set creation, uploads, settings, and empty/error states.
- [ ] Extend the system to `web/src/pages/Homework.tsx` and `web/src/pages/Summary.tsx`.
- [ ] Review shared components for leftover purple accents, gradients, glass effects, and inconsistent radii.

### 4. Verify the real interface

- [ ] Review the desktop layout around 1024px and 1440px, plus narrow widths around 320px and 390px.
- [ ] Check keyboard navigation, visible focus, text enlargement, and touch targets.
- [ ] Review all answer types, long questions, equations, code, feedback, scaffolding, loading, errors, and completion states.
- [ ] Confirm source viewing, topic switching, draft preservation, retry, test execution, and reveal behavior remain intact.
- [ ] Confirm both themes remain usable.
- [ ] Run the existing frontend typecheck: `cd web && bunx tsc --noEmit -p .`.

Use fixtures or an isolated instance for visual checks. Never use the user's real `data/` directory for testing, and avoid real tutor calls for presentation checks. Follow `AGENTS.md` for isolated ports and study-data directories. Do not change tutor tools, PDF attachment behavior, orchestration, or usage calculations as part of this redesign.

## Review criteria

The redesign is successful when the question is the clear visual priority, controls feel consistent, body text is comfortable to read, and the vibrant accents make actions and status easy to recognize. The app should feel calm during extended use while retaining the brighter palette the user approved.

The mockup's question, timer, topic counts, and feedback were illustrative. Integrate the design with real application state; do not copy its fixed sample behavior into production.
