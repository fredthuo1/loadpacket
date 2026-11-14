# BRF-94726 regression fixture

`ratecon-brf-94726.pdf` is an unchanged copy of the user-supplied, fictional
two-page `LoadPacket_Sample_Rate_Confirmation_BRF-94726.pdf`. It was not
regenerated for the test. SHA-256:
`2dd5784893bead99aa33d10fd28529777ea7e39914cfea97272ff1ff15ada2bb`.

`ratecon-brf-94726.json` contains its actual `pdf-parse` 2.4.5 text output and
page count. The parser unit test uses this text; the Playwright test uploads
the PDF through the real API and runs extraction again. In the extracted text,
both stop headings share one line, followed by complete pickup and delivery
blocks. Equipment and commodity also share one line.

Run the parser test with `pnpm --filter api test --runInBand ratecon-draft.spec.ts`
and browser test with `pnpm --filter web exec playwright test test/ratecon.spec.ts`.
The browser fixture binds localhost:3102 and requires explicit test mode. It
reuses the HTTP suite's query-aware memory database with memory file storage;
no provider account or operational database writes are used.
