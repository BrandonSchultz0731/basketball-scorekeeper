# Scoreboard (`/score/`)

The scorekeeper itself. For now, scoring is by hand; automatic detection plugs into the same screen in Phase 2. Everything is saved on the phone, so it works without a connection.

## Install it like an app

In Safari, open `/score/`, tap **Share → Add to Home Screen**. It then opens full screen from its own icon. Installed and browser copies keep separate history, so pick one and stick to it.

## Header

- **Settings:** opens the settings drawer (below).

## Game tab

**Before a game, or after one ends:**
- **Result card:** the last game's result, e.g. "door side wins 21–17". It says "Ended early" if the game was ended by hand before anyone won.
- **Start game / Start next game:** starts a new game at 0–0 with the current names and rules. Speech is also switched on at this tap, because iOS only allows audio that starts from a tap.
- **The line under the button:** shows who's playing and the rules for the next game.

**During a game:**
- **"Playing to 21, win by 2":** the rules this game uses. They're fixed when the game starts, so changing Settings mid-game doesn't change them.
- **Two score panels**, one per basket, named and colored. The side that's ahead gets a colored border.
  - **+2 / +3:** adds a basket. The numbers follow the point values in Settings.
  - **−1:** takes a point off, to fix a mistake.
- **Game end:** when a side reaches the target with the needed lead, the game ends by itself and the result card appears. If speech is on, it says something like "game, door side wins, 21 to 17". Baskets added after that are ignored.
- **Undo last:** removes the most recent entry. Undoing the winning basket reopens the game.
- **End game:** ends the game early, for example if it was abandoned. It takes two taps so it can't happen by accident.
- **Recent:** the last 5 entries, newest first.

While a game is live, the page asks the phone to keep the screen on.

## Log tab

Every entry in the current (or last) game, in order. The score is always worked out from this list, so fixing an entry fixes the score. For each entry:
- **time** since the game started
- **basket name**
- **points**, or "fix" for a −1 correction
- **auto** (later): added by the detector
- **check** (later): the detector wasn't sure, so review it

Buttons on each entry:
- **2/3:** switches between the two point values.
- **Swap:** moves the basket to the other side.
- **✕:** deletes it.

If a fix means nobody has won any more, the game goes back to live, unless it was ended early on purpose.

## History tab

Every game saved on this phone, newest first, with its date, final score and result:
- **live** means a game that's still going
- **won** shows which side won
- **ended early** means it was ended by hand

Tap a game to open its full log, which can be edited the same way. **Delete game** takes two taps.

## Settings

### Live score for other phones

Shown at the top of Settings. It lets everyone at the court follow the score on their own phone ([viewer guide](watch.md)).

- **Set up live score:** creates your group's room, once. Do it in the copy of the app you'll actually score with. Safari and the home-screen app keep separate data, so a room set up in one isn't connected in the other.
- **Code, QR code and link:** show the QR code or share the link. The code stays the same every week.
- **Status badge:**
  - **live**: connected and publishing.
  - **connecting…**: setting up the connection.
  - **offline, will catch up**: no connection right now. Scoring continues, and the latest score is sent when it reconnects.
  - **error**: something went wrong. The message says what.
- **Copy link:** copies the viewer link.
- **Get a new code:** makes a new room and deletes the old one, so the old link and QR code show "No game with that code". It takes two taps. If the phone is offline at that moment, the old room can't be deleted and is left behind. It's harmless, and can be removed in the Firebase console.

When a viewer taps **Start next game**, this phone starts the game as if you'd tapped it, but only if no game is live.

If speech is on, it's unlocked by your first tap on the page, so games started from a viewer's phone are announced too. iOS won't play speech until the phone itself has been tapped once.

### Scoring and names

- **Basket names:** name each basket after something near it, e.g. "door side" and "window side". "Left" means left as the camera sees the court. Names show on the scoreboard and in announcements. A game in progress keeps the names it started with.
- **Inside the arc / Beyond the arc:** points for each kind of basket, 2 and 3 by default. Some groups play 1s and 2s.
- **Play to:** the target score, 21 by default.
- **Win by 2:** needs a 2-point lead to win, on by default.
- **Say each score out loud:** announces each basket, e.g. "three, door side, 9 to 7". Works best with a Bluetooth speaker. Check the phone isn't on silent.
- **Test voice:** plays a sample announcement.

Scoring changes apply from the next game. Names and speech apply right away.

## Where the data lives

Game history and settings stay in the browser's storage on this phone (IndexedDB). Clearing Safari's website data deletes them.

If live score is set up, the phone also publishes the current game to Firebase: basket names, score, rules, the last 5 baskets, and whether a game is live. Nothing else is sent, and full history stays on the phone.
