# LoadPacket UI theme

The application intentionally uses its existing light slate/white theme with blue primary actions and navy emphasis panels. The device's dark-mode preference must not change inherited text independently of these surfaces. `globals.css` sets `color-scheme: light` for text and native controls.

- Default page text: slate-900; headings: slate-950; secondary text on light or tinted surfaces: slate-600.
- Navy panels keep explicit white/slate-300 or slate-400 text. Do not apply light-surface muted text colors inside these panels.
- Form values use a white surface and dark text; placeholders use slate-500. Shared management controls live in `components/management-ui.tsx`.
- Disabled actions use slate-100/200 surfaces with slate-600 text. Avoid reducing the opacity of the entire control or placing white labels on pale gray backgrounds.
- Green filled actions use emerald-700 with emerald-800 hover so their white labels remain readable. Existing status colors and blue primary actions are retained.
- Keyboard focus uses a visible blue outline. The dashboard's top panel uses the same centered page width and gutters as the content below it.

`test/theme.spec.ts` checks actual rendered contrast at normal-text 4.5:1 and large-text 3:1 thresholds for representative page states under light/dark device preferences. It covers login, dashboard, documents, roster, new-driver/company/manual-load forms, intake, Back Office, populated A/R and document review. It also checks disabled upload controls, error feedback, native form values/placeholders, keyboard focus and mobile document-page overflow. This is targeted regression coverage, not a claim of a complete accessibility audit.

Run `pnpm --filter web exec playwright test theme.spec.ts` for the focused check, or the complete web suite for functional regression. The established local pnpm store flags may be needed. No API, authorization or persistence behavior changed in this styling pass.
