# Standalone site
- Keep the portable HTML site embedded in the instanceSource template; the welcome/verification screen and /in route were removed, keep navigation hooks.
- Store personal link stars by URL in browser storage, matching the standalone site's existing local settings; no account or hosted service is required.
- Initialize weather from defaults only when no saved region exists; preserve explicitly saved region selections.
- Mirror existing sidebar data for additional information displays to keep weather, clocks, counts and news consistent without duplicate requests.
