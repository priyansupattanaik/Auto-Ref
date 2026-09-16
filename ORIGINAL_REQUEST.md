# Original User Request

## 2026-09-15T21:31:07Z

This is a single self-contained fix; keep it small and focused.

Rebrand the Chrome MV3 AI referral extension end-to-end from "RefLink" to "auto-ref" / "AutoRef", update all UI headers, content scripts, namespace, comments, and documentation, and fix the verification test harness path and assertions to achieve 100% passing tests.

Working directory: d:\My Creations\auto-ref
Integrity mode: development

## Requirements

### R1. End-to-End Rebranding
- Rename the extension in manifest.json to "AutoRef — AI Referral Assistant" with project name "auto-ref".
- Update the global JavaScript namespace in content scripts and libraries from window.RefLink to window.AutoRef.
- Update all UI templates, titles, headings, and branding elements across popup/popup.html, popup/popup.js, popup/popup.css, options/options.html, options/options.js, and options/options.css.
- Update documentation and meta files (BRIEF.md, PROGRESS.md, BUGLOG.md, test/mock-runner.md, test/checks.md) to reflect AutoRef / auto-ref.
- Ensure all storage schemas, phase names, and safety constraints (dryRun default, rate limits, NVIDIA API endpoint, selectors architecture) remain strictly intact.

### R2. Test Harness Repair & Complete Verification
- Fix the test harness in C:\Users\ircpr\AppData\Local\Temp\opencode\reflink-tests\harness.mjs (or relocate/copy it into test/ or adjust its ROOT path) to target d:\My Creations\auto-ref instead of the non-existent reflink/ subdirectory.
- Update the harness to load into window.AutoRef and match any rebranded selectors/names.
- Execute the test suite and verify that all 95/95 test assertions pass without errors.
- Ensure all JavaScript files pass node --check syntax validation.

## Acceptance Criteria

### Identity & UI
- [ ] manifest.json contains "name": "AutoRef — AI Referral Assistant".
- [ ] No active code or UI templates retain obsolete "RefLink" branding or references.
- [ ] Extension namespace is cleanly set to window.AutoRef.

### Quality & Verification
- [ ] All JS files in the project pass node --check with 0 syntax errors.
- [ ] The test harness executes successfully against the workspace with 95/95 (or 100%) assertions passing.
- [ ] Existing functionality (dry-run, scrapers, queue management, AI fallback, selectors) remains 100% functional.
