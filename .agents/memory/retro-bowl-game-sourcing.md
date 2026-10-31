---
name: Retro Bowl game sourcing
description: Licensing and iframe constraints for Nightshift's Retro Bowl entry.
---

Nightshift should point Retro Bowl to the browser release hosted by Poki. Do not try to embed or work around Poki's framing restrictions; open the licensed game directly in a new tab.

**Why:** Poki identifies the browser release as licensed and its page's `frame-ancestors` policy excludes Nightshift, so an iframe would fail.

**How to apply:** Keep the official top-level link available. If a user configures a different authorized source, sandbox it and retain an external-open fallback.
