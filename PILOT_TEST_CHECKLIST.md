# Pilot Test Checklist

## Goal
- Reach the point where a normal user can sign in, set up a profile, browse rank data, use bingo/social basics, and not immediately hit state corruption or obvious UI regressions.

## Recommended personal fiddling
- Sign in with Google, then complete signup with a fresh `DJ NAME` and `INFINITAS ID`.
- Edit profile text only and verify nothing else regresses.
- Upload TSV, switch tabs, refresh once, and confirm history/progress stay stable.
- Create or import bingo data, switch to another panel, come back, refresh once, and confirm the board still matches.
- Change social discoverability/banner settings, leave the panel, return, refresh once, and confirm they persist.
- Search another user by `DJ NAME` and confirm the result loads without exposing unrelated private data.
- Accept one bingo transfer or social action if you have a second account to test with.
- Open notice history/settings/social/goals repeatedly and confirm panel switching feels stable.

## High-value checks
- No "deleted but came back" behavior after refresh.
- No blank active bingo when saved boards exist.
- No broken panel after switching between `rank`, `history`, `goals`, `social`.
- Social search returns expected public profile fields only.
- Signup/profile save errors are understandable.
- Snapshot/rank page still renders quickly on first load.

## If something looks wrong
- Record the exact panel and action sequence.
- Note whether a refresh fixes it or makes it worse.
- Note whether a second tab was open.
- Keep the smallest repro sequence possible.
