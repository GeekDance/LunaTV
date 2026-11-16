# Free-tier search requirements

The active goal requires complete LunaTV functionality on the current upstream before changing `tv.hh7788.xyz`. The original administrator UI has 118 enabled sources. The real Workers Free trial returns only 50 matching source results for 118 identical public fixtures while showing `118/118` complete. Existing downstream code catches fetch-limit errors and turns them into empty results.

Required behavior:

- Preserve all authorized sources and the administrator's configured page limit. Do not solve this by selecting only 50 sources or reducing pages to one.
- On D1/Workers deployments, issue bounded requests from the browser. Each server invocation searches one authorized source page. No extra paid services or Workers are required.
- Retrieve source keys/names and the configured page limit from an authenticated manifest. Never expose upstream API URLs or accept arbitrary client-provided URLs.
- Preserve streaming-style incremental results, ordinary search mode, automatic source lookup on the play page, cancellation, and user-specific source restrictions.
- A failed source page must be reported separately from an empty successful page. Other sources must continue. Completion counts attempts; errors must remain visible.
- Keep the existing non-D1 deployment path working.
- Retest at least 118 one-page sources, multi-page sources, cancellation, unauthorized/disabled sources, login, homepage, playback, favorites and progress persistence on the real Free account.
- Domain cutover remains conditional on full validation. Original production data and DNS stay unchanged during this work.

Free-account daily request/read/write quotas still apply; document measured requests per search rather than promising unlimited traffic.
