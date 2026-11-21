# VOD stalled-start recovery

Observed regression: bounded preference can commit an unverified early source; fatal HLS retries and the custom loading overlay have no terminal path. Manual switching to a playable source was verified previously, but automatic failure recovery was not.

- Add a 12-second first-frame watchdog, cleared by actual video readiness. Stop failed HLS work, reveal an actionable error/recovery message and keep source selection available.
- Attempt at most two automatic recoveries. Probe progressive alternatives with a shared four-worker pool and eight-second deadline; first verified source wins. Never retry the same failed identity/stream, cancel on manual selection/retry/episode change/unmount.
- Pause source-card probing until primary video readiness and during recovery so it cannot compete with first-frame loading. Probe the actual requested episode.
- Preserve progress, bound failed recovery, expose retry and source-list actions, prevent late async work from overriding manual choices.
- Test stalled source, fatal errors, successful fallback, no available source, user retry, cleanup and late candidates. Run full checks and review before production deploy, then reproduce the originally failing automatic path on production.
