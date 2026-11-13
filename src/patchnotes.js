// Patch notes shown in the PATCH NOTES tab (rules.js). Newest first.
// To add an update: copy the first entry, change the version/date/title, list what players will notice.
// Tags: NEW, CHANGE, RULE (a scoring or rules change — always call these out), IMPROVED, FIX.
export const PATCH_NOTES = [
  {
    version: "v1.3",
    date: "Nov 12, 2026",
    title: "The Lineup Card & the Phone Handheld",
    notes: [
      ["NEW", "Phones get their own handheld: one screen at a time with FREE AGENTS, AWAY and HOME buttons, tap a player then a spot, and big AUTODRAFT and DRAFT buttons. PC and iPad stay the same."],
      ["RULE", "New LINEUP CARD after the shuffle: at any position where you have a starter and a backup, choose who starts. If both played that day, the one you started counts."],
      ["RULE", "Sit a regular and he swings in the Home Run Derby if the game ends tied."],
      ["RULE", "DH! Name a bench outfielder as your designated hitter on the lineup card. He bats 9th if his starter plays — but then he can't swing in the Home Run Derby."],
      ["IMPROVED", "Pitching staff: drag a pitcher by the ☰ grip to change his role."],
      ["IMPROVED", "The computer and AUTODRAFT pick their starting pitcher at random from that season's 15 best starters, so you'll face a different ace each game."],
      ["FIX", "A leftover computer pick could sneak in after the draft ended and change a team's SPARE pitcher."],
      ["RULE", "Set your pitching staff on the lineup card: tap two pitchers to swap roles. Want a starter closing or a different arm starting? Your call."],
      ["CHANGE", "Game day stats stay secret until the first pitch, so lineup calls are gut calls."],
      ["IMPROVED", "Protecting bench players matters more: a protected backup is guaranteed to be yours to start."],
      ["CHANGE", "Play-by-play follows the pitching changes: innings 1–5 with the starters, the 6th as the relievers come in, the 7th inning stretch, then the 7th, 8th and 9th half-inning by half-inning with the relievers and closers."],
      ["CHANGE", "SKIP jumps to the next pitching change: from the first pitch it goes to the top of the 6th."],
      ["CHANGE", "Tied after 9? EXTRA INNINGS! The Home Run Derby is now played as the 10th inning."],
      ["IMPROVED", "The draft list now says its stats are decade totals (e.g. 1990–1999)."],
      ["NEW", "CHARGE! A retro fanfare (turn SOUND on) plays at the first pitch, kicks off the 10th inning Home Run Derby, and sometimes greets the bullpens in the top of the 6th."],
    ],
  },
  {
    version: "v1.2",
    date: "Nov 6, 2026",
    title: "Rules, Patch Notes & the Home Run Derby",
    notes: [
      ["NEW", "Patch Notes — you're reading them."],
      ["NEW", "RULES & FAQ, one click away on every screen."],
      ["RULE", "Tied games now go to a Home Run Derby. Bench players who sat because their starter played count every homer they hit that week (3 days either side of game day). Still tied? Starters' homers on game day, then a coin flip."],
      ["NEW", "Home Run Derby screens: flashing banner, home run ball, coin flip, fanfare and drumroll (turn SOUND on)."],
      ["IMPROVED", "The computer manager only drafts players who were in the majors in the game's year, and mixes up its bench more. AUTO-DRAFT does the same for you."],
    ],
  },
  {
    version: "v1.1",
    date: "Nov 6, 2026",
    title: "The Handheld & the Time Machine",
    notes: [
      ["NEW", "Retro handheld look: cream case, LED scoreboard and ticker, green field with runner lights."],
      ["CHANGE", "The time machine travels to game day BEFORE the draft: a flip clock rolls back from today to the real date you're playing, so you know exactly which day you're drafting for."],
      ["NEW", "START THE DRAFT button — read the date as long as you like."],
      ["NEW", "Game day date on the draft screen and on the scoreboard."],
      ["NEW", "BENCH buttons: see each team's bench, who's protected, and their stats from game day."],
      ["NEW", "SOUND button for retro beeps."],
      ["NEW", "30+ new names for the computer manager — watch out for Wild Thing, Jobu and Smalls."],
    ],
  },
  {
    version: "v1.0",
    date: "Nov 6, 2026",
    title: "Launch",
    notes: [
      ["NEW", "Time Machine Baseball is live at timemachinebaseball.com!"],
      ["NEW", "Draft from any decade, the 1950s through the 2010s — or hit SURPRISE ME."],
      ["NEW", "Play a friend online with a 4-letter room code, or PLAY THE COMPUTER."],
      ["NEW", "Snake draft from a sortable stat table of every player in the decade, with AUTO-DRAFT."],
      ["NEW", "Protect 4 bench players, then the shuffle: every other spot is a coin flip between teams."],
      ["NEW", "Game day plays out step by step with NEXT and SKIP, a 7th inning stretch, and box scores — click any player for his real game."],
      ["NEW", "Lost your game? Rejoin with the room code and your name. If someone disconnects, it's a RAIN DELAY until they're back."],
    ],
  },
];
