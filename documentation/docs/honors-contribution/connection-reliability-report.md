---
sidebar_position: 1
title: Connection Reliability Report
---

# Connection Reliability Report

**Fall 2026 Honors contract** · Fork: [Inkbottle011/hippio-revisions](https://github.com/Inkbottle011/hippio-revisions) · Upstream: [Civic-Interactions-Lab/hippio](https://github.com/Civic-Interactions-Lab/hippio)

## Summary

Hungry Hippos had a known problem: the connection to the backend was unreliable, and players' actions were sometimes lost and never happened. I traced this to seven issues across the client and server, reproduced each one, and fixed all seven through five pull requests. A bug introduced by one of the fixes was caught in manual testing and fixed in the same pull request, and a sixth pull request repaired a merge mistake. The test suite grew from 19 to 42 tests, and the 23 new tests each check one of the fixes.

The clearest result: before the fixes, the AAC player's food choices usually never reached the hippo players' screens. In three scripted games, the hippo screen showed 0 of 5, 0 of 5, and 3 of 5 choices. After the fixes, it showed 5 of 5 in all three.

## The Problem

In Hungry Hippos, one player (the AAC conductor) uses a picture board to choose which food the hippos should eat, and the other players control hippos that catch it. Every action travels over a single WebSocket connection between each browser and a Node.js server.

When messages are lost, the game breaks in ways players notice: the AAC player's choice does not appear, a player is stuck on a frozen screen after a network drop, or a player's hippo disappears after a refresh. The AAC conductor is hit hardest, because if their choice never arrives, the child's decision simply does not happen.

## Approach

1. **Read the code first.** I read the client connection code (`WebSocketContext.tsx`) and the server (`sessionAPI.js`) and listed five likely causes.
2. **Reproduce before fixing.** For each cause, I either triggered it in the running game (with screenshots and logs) or wrote a test that showed it, before changing any code.
3. **Track every problem as an issue.** Each problem became a GitHub issue with steps to reproduce, the cause, and a proposed fix.
4. **One branch and pull request per fix,** with a test that fails on the old code and passes on the new code.
5. **Test in a real browser.** After unit tests passed, I played full games (presenter, AAC player, and hippo in separate browsers) to check the fix in practice. This caught two bugs the unit tests missed.

## Issues and Fixes

| Issue | Problem | Fix | PR |
| --- | --- | --- | --- |
| [#1](https://github.com/Inkbottle011/hippio-revisions/issues/1) | Empty sessions were never cleaned up | Check for an empty session after removing the player; clean up after a 30 s grace period | [#6](https://github.com/Inkbottle011/hippio-revisions/pull/6) |
| [#2](https://github.com/Inkbottle011/hippio-revisions/issues/2) | Messages sent while the socket was not open were thrown away | Queue messages and send them once connected | [#7](https://github.com/Inkbottle011/hippio-revisions/pull/7) |
| [#3](https://github.com/Inkbottle011/hippio-revisions/issues/3) | The client never reconnected after a drop | Reconnect automatically with growing delays | [#7](https://github.com/Inkbottle011/hippio-revisions/pull/7) |
| [#4](https://github.com/Inkbottle011/hippio-revisions/issues/4) | Dead connections were never detected | Server heartbeat (ping every 30 s) | [#8](https://github.com/Inkbottle011/hippio-revisions/pull/8) |
| [#5](https://github.com/Inkbottle011/hippio-revisions/issues/5) | Pages missed messages that arrived close together | Replace `lastMessage` with per-type subscriptions | [#12](https://github.com/Inkbottle011/hippio-revisions/pull/12) |
| [#9](https://github.com/Inkbottle011/hippio-revisions/issues/9) | Server replied "Server error" to messages for a deleted session | Ignore messages for sessions that no longer exist | [#13](https://github.com/Inkbottle011/hippio-revisions/pull/13) |
| [#10](https://github.com/Inkbottle011/hippio-revisions/issues/10) | Game screen crashed while closing | Only clear the fruit group if Phaser has not already destroyed it | [#13](https://github.com/Inkbottle011/hippio-revisions/pull/13) |

Issues #9 and #10 were not in the original plan. I found them while manually testing the reconnect fix.

### #1 Empty sessions never cleaned up

**Cause:** When a player disconnected, the server checked whether the session was empty *before* removing that player, so the last player was still counted and the check never passed. The second check that would have caught it was commented out.

**Evidence:** With a debug log added, closing every tab left the session and its fruit timer running:

```
WSS Player left, broadcasting updated USERS_LIST_UPDATE to O7DWG: []
[DEBUG] sessions left: [ 'O7DWG' ] fruit timers: [ 'O7DWG' ]
```

**Fix:** Check after the player is removed. Deleting the session immediately would break a player who refreshes their page, since the session is briefly empty while they reconnect. So the server waits 30 seconds and cancels the cleanup if anyone rejoins.

### #2 and #3 Dropped messages and no reconnect

**Cause:** `sendMessage` logged an error and discarded any message sent while the socket was not open, and the `onclose` handler only marked the client as disconnected. The game screen also sent its first messages before the socket finished opening, so they were lost on every page load.

**Evidence:** Restarting the server mid-game left every tab on a frozen screen, with one refused connection attempt and no retry. Refreshing the game screen produced `Cannot send message, WebSocket is not open`.

**Fix:** The connection logic moved into a `connect()` function that runs again after 0.5 s, 1 s, 2 s, 4 s, 8 s, then every 10 s. Messages sent while disconnected are queued (up to 50) and sent in order once connected. Movement updates are not queued, because they are out of date by then.

**Bug found during manual testing:** After this change, refreshing the hippo tab made the player's hippo disappear. The refresh now sent two join messages: the automatic rejoin with the player's color, then the game page's own queued join without one. The server overwrote the color with `undefined`. Previously the second join was silently dropped, which hid this server bug. I wrote a test that reproduced it, then changed one line so a join without a color keeps the existing one.

### #4 No heartbeat

**Cause:** Neither side checked whether a connection was still alive, so a player whose device lost its connection without closing it stayed in the session indefinitely.

**Fix:** Every 30 seconds the server pings each client. Browsers answer pings automatically, so no client code was needed. A client that misses a ping is disconnected on the next check, which runs the normal cleanup.

**Evidence:** With a real server and a 1 s interval, a client set to never answer pings was removed (`No heartbeat from SilentPlayer ... Disconnecting.`), while a normal client stayed connected.

### #5 Missed messages

**Cause:** Every page read server messages from a single shared `lastMessage` value, which is React state. When two messages arrived before React re-rendered, the second overwrote the first. During a game the server sends a food-position update every 50 ms, so the AAC player's choice was frequently overwritten before the hippo screen saw it.

**Evidence:** A test sending the two messages back to back showed the page only received the second:

```
Server sent: AAC_TARGET_FOOD, FOOD_STATE_UPDATE
Page saw:    FOOD_STATE_UPDATE
```

In a real browser, the AAC player chose 5 foods per game:

| | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- |
| Before | 0 of 5 shown | 0 of 5 shown | 3 of 5, then stuck |
| After | 5 of 5 | 5 of 5 | 5 of 5 |

**Fix:** The context gained `subscribe(type, listener)`, which calls each listener directly as messages arrive, outside React state. Pages use a small hook, `useMessage(type, handler)`. All six pages that used `lastMessage` were moved over, and `lastMessage` was removed. This also fixed the AAC page re-running its game-over handler whenever scores changed after the game ended.

### #9 "Server error" for deleted sessions

**Cause:** After a server restart, a client's queued messages referred to a session the server no longer had. Handlers such as `AAC_FOOD_SELECTED` read that missing session, threw an error, and the client received a generic "Server error."

**Fix:** The server ignores and logs any message for an unknown session, except `PLAYER_JOIN`, which still replies `SESSION_NOT_FOUND` so the player is sent home.

### #10 Crash when leaving the game screen

**Cause:** When the game screen closed, Phaser destroyed the fruit group before the scene's own cleanup ran, and the cleanup then called `clear()` on the destroyed group: `Cannot read properties of undefined (reading 'size')`.

**Fix:** Only clear the group if it still exists. Restarting the server mid-game produced 2 crashes on the old code and 0 with the fix.

## Testing

| Area | Test file | Tests |
| --- | --- | --- |
| Empty-session cleanup | `tests/sessionCleanup.test.ts` | 3 |
| Heartbeat | `tests/heartbeat.test.ts` | 3 |
| Hippo color on rejoin | `tests/playerJoin.test.ts` | 1 |
| Deleted sessions | `tests/staleSession.test.ts` | 3 |
| Reconnect, queue, subscriptions | `src/contexts/WebSocketContext.test.tsx` | 10 |
| Target food on the game screen | `src/pages/PhaserPage/PhaserPage.test.tsx` | 1 |
| Game screen cleanup | `src/game/scenes/Game.test.ts` | 2 |
| **Total added** | | **23** |

The full suite went from 19 to 42 tests, all passing. Where possible, each test was run against the old code first to confirm it fails, so it actually detects the bug. Server tests import `sessionAPI.js` without starting the server, which required two small changes for testability: the close handler became a named, exported function, and the server only starts listening when run directly.

Beyond unit tests, every fix was checked in a real browser with separate presenter, AAC, and hippo players, including refreshing pages and restarting the server mid-game. Each test is described in [Unit tests](../testing/unit-testing.mdx).

## Workflow

- **Fork and branches:** All work happened in a fork, one branch per fix (`fix/session-cleanup`, `fix/ws-reconnect`, `fix/heartbeat`, `fix/exports`, `fix/message-subscriptions`, `fix/issues-6-and-7`), each merged into `main` through a pull request.
- **Issues:** Each issue recorded steps to reproduce, evidence, the cause, and a proposed fix. Two issues were marked `needs-repro` until they were reproduced.
- **Pull requests:** Each PR described the change, linked its issues, and included test results and before/after evidence.

### What went wrong, and what I learned

- **A merge silently removed code.** Merging `main` into the reconnect branch produced a conflict on the `module.exports` line, and resolving it dropped the two heartbeat functions. The heartbeat still worked, but three tests failed on `main` afterward. PR [#11](https://github.com/Inkbottle011/hippio-revisions/pull/11) restored them. Running the test suite automatically on every pull request with GitHub Actions (which GitHub turns off on forks until enabled) would have caught this before merging.
- **The editor reformatted a whole file.** Twice, my editor re-indented about 930 lines of `sessionAPI.js`, which made a small change look like a rewrite. The first time I caught it before committing; the second time it was merged, and PR #13 restored the original indentation. Turning off automatic formatting on save and paste prevents this. Reviewing `git diff -w` (which ignores whitespace) became part of my routine.
- **Fixing one bug can expose another.** The message queue was correct, but delivering messages that used to be dropped revealed the hippo-color bug and the "Server error" bug. Manual testing in a real browser found both.

## Documentation

- [Component Descriptions: Connection Reliability](../system-architecture/component-descriptions.md)
- [Sequence Diagrams: Connection Recovery](../system-architecture/sequence-diagrams.md)
- [Frontend API: WebSocketContext.tsx](../api-specification/Frontend.md)
- [Backend API: Connection Reliability](../api-specification/Backend.md)
- [Unit tests: Connection Reliability Tests](../testing/unit-testing.mdx)

## Limitations and Future Work

- **Production not tested.** All testing was local. The deployed backend runs on Render's free plan, which can restart the server, so automatic reconnection should help most there, but it has not been verified on the live site.
- **State after a mid-game reconnect.** If a player reconnects while the session still exists, they receive new updates but not a full snapshot of the current scores and timer. A state resync on rejoin was a stretch goal.
- **Reconnecting indicator.** The context exposes `isReconnecting`, but no screen shows it yet. A small "Reconnecting..." banner would make drops visible to players.
- **Upstream contribution.** These fixes live in my fork. They could be submitted to the Civic Interactions Lab repository as pull requests.
