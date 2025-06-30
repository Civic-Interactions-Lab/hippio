---
sidebar_position: 3
---
# Acceptance test

| Test ID | Action/Steps | Notes/Expected Result |
|---------|--------------|------------------------|
| HHP-1 &nbsp; | **Start Game Session**<br />Open the application and navigate to the session creation screen<br />Select the Create Game option | The application displays a unique room code on the screen and shows a "Waiting for Players" status. |
| HHP-2 | **Join Game Session**<br />Open the application and enter the Room Code provided by the host<br />Tap the "Join Game" button | The code is accepted, and the player is added to the game lobby to wait for the host to start. |
| HHP-3 | **Start Game**<br />The host player clicks the "Start Game" button | A 3 seconds countdown begins on all connected players' screens, after which gameplay starts. |
| HHP-4 | **Control Fruit Queue (AAC User)**<br />During gameplay, as the AAC user, select food from the available options.<br />Select 2 or more fruits to fill the 3 item queue. | Each selected food appears in the queue. The food then becomes visible on all players' screens. |
| HHP-5 | **Eats Food (Player)**<br />As a player, observe the "correct" food displayed from the AAC user's queue.<br />Move the hippo character to collide with a matching food. | A point is awarded for eating the correct food. No point is awarded for an incorrect food. |
| HHP-6 | **Game Timer and End State**<br />The host can change the game timer.<br />The timer reaches 0. | The game ends, and a score screen is shown to all players. The host sees options to "Play Again" or "End Game". |
| HHP-7 | **Play Again**<br />After a game round ends, the host can tap "Play Again" button | The game redirects back to the gameplay screen and starts a new 3 second countdown for all players. |
