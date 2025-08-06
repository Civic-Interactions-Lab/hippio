---
sidebar_position: 3
---
# Acceptance test

| Test ID | Action/Steps | Notes/Expected Result |
|---------|--------------|------------------------|
| HHP-1 &nbsp; | **Start Game Session**<br />Open the application and navigate to the session creation screen<br />Select the 'No code? Create new game!' option | The application displays a unique room code on the screen and lists any connected players. |
| HHP-2 | **Join Game Session**<br />Open the application and enter the Room Code provided by the host<br />Tap the "Join Game" button | The code is accepted, and the player is added to the game lobby after selecting a role. |
| HHP-3 | **Start Game**<br />The host player clicks the "Start Game" button after there is a minimum of one hippo and one aac user. | The game starts immediately on all connected players' screens. |
| HHP-4 | **Control Fruit Queue (AAC User)**<br />During gameplay, as the AAC user, select food from the available options.| The food then becomes visible on all players' screens. |
| HHP-5 | **Eats Food (Player)**<br />As a player, observe the "correct" food displayed from the AAC user's queue.<br />Move the hippo character to collide with a matching food. | A point is awarded for eating the correct food. A point is lost for an incorrect food. |
| HHP-6 | **Game Timer and End State**<br />The timer reaches 0.<br />All users see victory screen. | The game ends, and a score screen is shown to all players. The host sees options to "Play Again" or "End Game". |
| HHP-7 | **Play Again**<br />After a game round ends, the host can tap "Play Again" button | The game redirects back to the gameplay screen and starts a new 3 second countdown for all players. |
