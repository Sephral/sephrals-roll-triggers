# Sephral’s Roll Triggers Manual

This manual covers the details. For a quick overview see the [README](README.md).

Roll Triggers watches the rolls in the chat and runs your house rule actions when a roll matches. It never changes a roll, never rerolls dice and does not replace your game system's own resolution. It only reacts after the roll is there. Combat triggers do the same for what happens in a combat, such as the start of a turn or an effect that ends.

## Requirements

* Foundry VTT v13 or v14
* GM permissions for creating triggers and managing profiles

## Opening the manager

* In the module settings: `Trigger manager`
* In the scene controls on the left: the Roll Triggers icon opens and closes the manager

The manager has two areas:

* **Configured triggers:** the triggers active in this world, each marked as a roll trigger or a combat trigger. *Ready rules* opens the gallery of ready house rules, *Create trigger* opens the editor, *Test* the test bench
* **Profiles:** ready made bundles of triggers you can import into the world

The manager, the trigger editor and the gallery are windows of their own. They follow the theme and language settings, and Foundry offers its usual window controls (in Foundry 14 also detaching them).

## Ready rules

*Ready rules* in the manager (or `game.modules.get("sephrals-roll-triggers").api.openGallery()`) opens a gallery of ready house rules. Nobody has to write a trigger from scratch: pick a rule, read what it does in plain words ("When ... Then ...") and add it with one click.

* **Only what fits:** the gallery lists the rules for the game system of the world. Rules that fit every system (natural 20 and natural 1 on a d20, d100 rules, any roll, combat events) are always there. *Show rules for other game systems* lists the rest
* **Search:** the search box looks into the title and the plain words
* **Add:** adds the rule as a normal trigger of the world, switched on. *Add and edit* adds it and opens the editor right away. Everything can be changed afterwards, and the rule keeps its mark, so the card shows *In your world*. A rule can be added again, each copy is a trigger of its own
* **Choices on the card:** a rule that rolls a table needs its roll table, chosen on the card (the rule is not added until you pick one). Some rules have a number, for example the total below which the GM gets a note. The plain words follow the number
* **Execution:** rules that only post a message or a note run automatically. Rules that change something on an actor (grant Inspiration, a hero point, a benny or Heroism, knock a creature prone) ask the GM first. The card says which

The rules, by group:

* **Natural 20 and natural 1:** cheer, roll a table or a bonus die on a natural 20, groan, roll a table or note for the GM on a natural 1
* **Percentile systems:** 01 is a critical, 100 is a fumble, doubles mark an improvement, a very low roll is announced
* **Any roll, any system:** a low total whispers the GM, a huge total gets a callout, doubles get a cheer
* **D&D 5e:** critical hit cheer, table and Inspiration, fumble table, prone and GM note, failed death save warns the GM, natural 20 on a death save, maximum damage callout, natural 20 on initiative
* **Pathfinder 2e:** critical success cheer, critical failure note and table, a natural 20 grants a hero point
* **Savage Worlds:** snake eyes note, ace callout, an ace earns a benny
* **Crucible:** triple on a check, three ones note, a triple grants Heroism
* **Combat events:** announce every turn and round, a note at the start of an NPC turn, a reminder every few rounds, a table roll in one round, call for initiative, a reminder when the fight ends, announce ending effects

The texts of the rules are in English and German. The messages a rule posts use the language you have chosen for the module when you add the rule.

## Settings

* **Enable roll triggers:** turns the triggers on or off for the world
* **Module language:** follow Foundry (including community translations), German or English
* **Manager theme:** Signature or Foundry look, for the manager, the editor and the gallery
* **Default execution mode:** the execution mode for new triggers
* **Allow player buttons:** players can use trigger chat buttons on their own rolls and on rolls of actors they own (never on blind rolls)
* **Enable import and export:** shows the import and export buttons
* **Show internal presets:** shows the included starter profiles
* **Store triggered matches on chat messages:** remembers which messages already fired, so a trigger never fires twice for the same message
* **Respect private rolls:** private, self and blind rolls stay private. Public actions of such rolls are whispered to the GM instead, and actions of a blind roll never go to players
* **Maximum actions per chat message:** limits how many actions one message can start. A trigger whose actions would go over the limit is skipped
* **Run self test:** checks the stored triggers and profiles, runs a test roll through every trigger and checks the manager window. Run it after every update of Foundry or the system. When a newer version than the tested one is installed, the GM gets a notice once. Macros call it as `game.modules.get("sephrals-roll-triggers").api.runSelfTest()`
* **Save debug file:** saves a file for bug reports, see *Debug file*

The gear in the title bar of the manager and the test bench opens these settings.

## Debug file

When a trigger does not fire as expected, a debug file shows what Roll Triggers saw. It is one file for all of Sephral’s modules in the world, and GMs save it in two places:

* **Settings, Save debug file:** the latest 20 roll messages
* **Chat, right click on a message, Save Debug File (Sephral’s Modules):** this one message

The file holds the Foundry, system and module versions, the active modules, the settings of the modules, the active triggers, the stored data of the chat messages with their rolls, the roll events read from them, every active trigger checked against each roll (match, the filters that block it, the conditions that fail) and what the chat processing decided when the message came in, for example a skipped message because another GM is the active GM, or a trigger that already fired on this card. Those decisions are only known for messages that came in since the last reload. Macros save one with `game.modules.get("sephrals-roll-triggers").api.saveDebugFile(messageId)`, without a message id for the latest messages.

The file contains chat text and whispers, check it before you share it.

## Sephral’s Modules

The first button in the module settings, *Sephral’s Modules* (GMs only), opens one window for all of Sephral's modules in the world: the version, self test, settings, manual and demo video of each, a button that switches on an installed module that is off (Foundry then reloads the world for everyone), and the debug file. Below, *More from Sephral* lists other modules that fit the game system of the world, shown only after a click, each with its demo video and an *Install* button. Foundry installs modules only on its setup screen, so the button copies the module's link (manifest URL) and shows the steps with a short clip. When the GM launches the world again, the window opens once with the new module and its *Enable* button. The list is part of the module. Only a video you start is loaded, from the module page on GitHub. If the GM agreed to the usage statistics, the window also counts how it is used: opened, the other modules shown, a video or install link of one of them, a module installed or switched on from it. It never records which module.

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For Roll Triggers it holds:

* on how many of the last 30 days the module was used
* how often triggers fire, chat buttons of a trigger are used, triggers are created, copied or edited, profiles are imported, files are imported or exported and the test bench is opened
* how often the gallery of ready rules is opened and a rule is added from it, how many combat triggers are created and how often a combat event sets one off
* the settings *Manager theme*, *Default execution mode* and *Allow player buttons* (only the chosen option)
* where errors occur in the module code: file, line, error type and whether the error arose in the module itself, in Foundry, in the game system or in another module, never the error message or the name of another module

No names, chat messages, notes, dice results or other content of the world are sent.

## Trigger basics

A trigger has four parts:

* **General:** name, description, priority and execution mode
* **Match:** the dice or roll condition that must be true, plus optional AND conditions (for a combat trigger the **Event** tab)
* **Filters:** optional limits on when the trigger may fire
* **Actions:** what happens when the trigger matches

Triggers with a higher priority are checked first. If several triggers match the same roll, they all run, unless a trigger is set to stop the ones after it.

A trigger fires at most once per chat message, even when the message holds several rolls, for example a damage card with several damage parts. The first matching roll counts. The switch *Once per chat message* on the general tab of the editor turns this off, then the trigger fires for every matching roll of a message. Older versions kept this switch in two hidden fields (`oncePerMessage` and `allowMultipleMatches`). Both still work for triggers saved by an older version, and the editor saves the one field `oncePerMessage`.

Some modules post a card first and add its rolls a moment later, for example Ready Set Roll and MidiQOL. Roll Triggers checks such rolls when they arrive, each roll once.

## Combat triggers

A trigger reacts to a roll or to a combat event. The general tab of the editor has the choice *Reacts to*. A combat trigger takes its place in the same list, with a *Combat* mark, and uses the same actions, priority and *stop lower priority* rule as a roll trigger. The *Match* tab becomes the *Event* tab:

* **Start of a turn** and **end of a turn:** of the combatant whose turn it is
* **Start of a round:** at the beginning of every new round
* **Combat starts:** when the combat begins (together with the start of round 1 and of the first turn)
* **Combat ends:** when the combat is deleted, only for a combat that had started
* **An effect ends:** an effect of a combatant's actor runs out or is removed while its combat runs. The name of the effect (or one of its statuses) can be limited with a text it must contain

For the events with rounds, *Only in round* limits the trigger to one round, *Every N rounds* to the rounds 3, 6, 9 (with N = 3), and both together count from the round given: round 2 and every 3 gives 2, 5, 8.

The filters of a combat trigger are the actor type (PC, NPC), actors and scenes. They exist for the events that belong to a combatant. Roll filters, AND conditions and the chat button mode do not apply. A combat trigger can run automatically, ask the GM first (the question names the event), tell the GMs privately that it matched or be switched off.

Only the designated active GM runs combat triggers, and every event counts once, even with several GMs and players online. The events come in the order Foundry runs them: end of the turn, start of the new rounds, start of the new turn. Going back in the tracker brings no events. When the tracker jumps over several turns, only the turn that ends and the turn that starts count, but every new round does. An effect counts when its duration runs out at a turn change or when it is deleted from the actor, whichever comes first, never twice.

Templates of combat triggers can use `{{actor.name}}` (empty for events without a combatant), `{{combat.round}}`, `{{combat.turn}}`, `{{combat.name}}`, `{{combat.event}}`, `{{combatant.name}}` and `{{effect.name}}`. Roll placeholders are empty. An action for the player who rolled reaches the first player who owns the actor and is online, nobody otherwise. A roll table action offers the draw to the hook `sephrals-roll-triggers.rollTable` like every roll table action.

A combat trigger is stored with `kind: "combat"` and the settings under `combat`. Its match is the marker `combat-event`, so a version of Roll Triggers without combat triggers imports it as a trigger that never matches.

The test bench and the debug file leave combat triggers out of their roll checks. The debug file lists them as the active combat triggers, and its trace records every combat event the service saw and the triggers that matched.

## Match types

* Die shows a specific value
* Die shows its minimum
* Die shows its maximum
* At least N dice show a specific value
* At least N dice show minimum
* At least N dice show maximum
* All dice of a type show the same value (needs at least two dice of that type)
* At least N dice of a type show the same value
* A die result is above or below a threshold
* Total result above or below a threshold
* Success degree matches: critical success, success, failure or critical failure. Pathfinder 2e degrees of success are recognized too
* System flag present: for systems that mark special results on the roll message
* Custom JavaScript condition: for advanced users, checked by the GM

The editor only shows the fields the chosen match type needs. *Die shows its maximum*, for example, only needs the die faces. Leave the die faces empty to check every die of the roll.

## AND conditions

Below the main match, `Add AND condition` adds another condition with its own match type. The trigger only fires when the main match and every added condition are true for the same roll. `Remove condition` deletes one again.

Each condition checks the whole roll on its own. Example for Savage Worlds: main match *Die shows a specific value* with value 1, plus an AND condition *Die shows a specific value* with value 2. To require two dice with the same value, use *At least N dice show a specific value* instead of two identical conditions.

The trigger list shows all conditions joined with AND. Exports include the AND conditions, and older exports without them still import.

## Filters

Filters limit when a matching roll may fire the trigger:

* Roll type: attack, check, save, damage, healing, skill, initiative, utility, other
* Actor type: PC, NPC, vehicle
* Roll visibility: public, GM or private, blind, self
* Combat: in combat or out of combat
* Scenes, actors and items you pick. Once actors are picked, the item list shows their items first, for example *Aria: Longsword*. An item from the sidebar also counts for items with the same name on any actor, because an item dropped on an actor gets a new id
* Rolls by players only or by the GM only

In D&D 5e, ability and tool checks count as *check*, death saves as *save*, hit dice as *healing*, and hit point and utility rolls as *utility*. Initiative rolls from the combat tracker count as *initiative* in every system.

## Actions

Each trigger can hold several actions. Empty actions are ignored, and a trigger without any action does nothing.

* **Chat message:** posts a message from your template
* **Roll table:** draws from a roll table and posts Foundry's result card. Another module can take over the draw through the hook `sephrals-roll-triggers.rollTable`, called with `{table, trigger, event, action, postResult, visibility, whisper, flags, handled, result}`. A listener that rolls the table itself sets `handled` to `true` and `result` to a promise, and puts `flags` on the card it posts so the card does not match a trigger again. Sephral’s Deep Tables does this
* **Macro:** runs a macro
* **Journal link:** posts a link to a journal entry. With an empty template it posts the trigger name and the link, a template of your own replaces both (`{{journal.name}}` and `{{journal.uuid}}` are available)
* **GM note:** sends a note to the GMs
* **Play sound:** plays an audio file. Pick it with the browse button and set the volume from 0 to 100 (80 when left empty). Public plays for everyone, GM whisper for the GMs only, player whisper for the player who rolled
* **Apply status or effect:** gives the actor who rolled, or every token the roller targeted, a status from your game system such as Prone. Instead of a status you can enter the UUID of an existing Active Effect, for example one on an item, and the actor gets a copy. An optional duration in rounds lets the effect run out in combat. An actor that already has the status or the copied effect keeps it unchanged
* **Change resource:** adds to, subtracts from or sets an attribute of the actor who rolled. The path starts with `system.`, for example `system.attributes.inspiration` (D&D 5e), `system.bennies.value` (Savage Worlds) or `system.resources.heroism.value` (Crucible). The value is a number or a placeholder such as `{{roll.total}}`. When the attribute has a maximum next to it (`.max` beside `.value`), the result stays between 0 (or the `.min` value) and that maximum. Yes or no attributes such as D&D 5e inspiration are switched on by adding or setting a value above 0 and switched off by subtracting or setting 0
* **Show image:** opens an image or video in a popout window with an optional caption. Public shows it to everyone, GM whisper to the GMs, player whisper to the player who rolled
* **Roll formula:** rolls an extra formula to the chat, for example `1d10` for a fumble table die, with an optional flavor text above the roll. This roll never fires triggers itself

Where it makes sense, an action can be public, whispered to the GM or whispered to the player who rolled. The new actions follow the execution modes and the once per message rule like all other actions, and with *Respect private rolls* a public sound or image of a private or blind roll only reaches the GMs.

The editor checks the sound, effect, resource, image and formula actions when you save. If something is missing, a message names the action and the editor stays open.

For targeted tokens, D&D 5e and Pathfinder 2e store the targets on the roll. In other systems the tokens the roller has targeted when the roll arrives count.

Templates can use these placeholders:

* `{{trigger.name}}`
* `{{actor.name}}`
* `{{user.name}}`
* `{{roll.formula}}`
* `{{roll.total}}`
* `{{roll.type}}`
* `{{roll.results}}`

Templates may contain HTML. Values such as actor or user names are inserted as plain text. The placeholders also work in the image caption, the roll formula, its flavor text and the resource value.

## Execution modes

* **Automatic:** runs the actions right away
* **Ask GM:** asks the GM first
* **Chat button:** shows a button on the chat message that runs the actions
* **GM whisper log:** only tells the GMs privately that the trigger matched
* **Disabled:** never runs

When a player clicks a chat button, the GM's client runs the actions. Players only get buttons on their own rolls and on rolls of actors they own. If no GM is online, the click shows a warning and nothing runs.

With several GMs or Assistant GMs online, only one of them runs the triggers, so nothing happens twice.

## Test bench

`Test` in the trigger list opens the test bench. It shows which triggers a roll would fire and why, without posting anything.

1. Enter a formula such as `2d6+3`, `1d20` or `1d100`.
2. Set the face of each die, or leave a die empty to roll it randomly. Up to 20 dice can be set.
3. Choose the roll type, the actor (optional), who rolled, the roll visibility, the success degree for success degree conditions and whether the roll counts as in combat. The tokens you have targeted count as the targets of the roll.
4. Click `Simulate`.

Every trigger appears in priority order with its verdict:

* **Matches:** the conditions are true and no filter blocks the roll. The card shows what the execution mode would do and which actions would run, or that the trigger would be skipped because of the action limit per message
* **No match:** each condition is listed with a check mark or a cross, and every filter that blocks the roll is named
* **Switched off:** the trigger is disabled
* **Not checked:** a trigger with a higher priority matched and stops the triggers below it

The bench uses the same roll reading and the same matching as real rolls, so its verdict is the one you get in play. Nothing runs and no chat message is created until you choose one of these:

* **Run actions for real:** after a confirmation, runs the actions of every matching trigger right away, whatever its execution mode. Disabled triggers and triggers over the action limit are left out. Messages, sounds and changes to actors really happen
* **Roll to chat:** posts a real roll with the same dice, roll type, success degree and visibility, so the whole chat processing runs end to end. Combat and the roller are the real ones here, and the roll is posted by you

Macro users can open the bench with `game.modules.get("sephrals-roll-triggers").api.openTestBench()`.

`game.modules.get("sephrals-roll-triggers").api.samples()` lists sample windows and chat cards over made-up rules (rules window, ready rules, editor tabs, test bench, questions, reaction cards). They save nothing and run no rule, translators and testers use them to see every text in its place.

## Profiles

Profiles are bundles of triggers. Import one into the world, or export your own to use it elsewhere.

The gallery of ready rules is the quicker start. Starter profiles are included for:

* D&D 5e
* Pathfinder 2e
* DSA5
* Cyberpunk RED
* Call of Cthulhu 7e
* Savage Worlds
* Alien RPG
* Warhammer Fantasy Roleplay 4e
* Fallout 2d20
* Dungeon Crawl Classics
* Blades in the Dark
* Forbidden Lands
* GURPS
* Torg Eternity
* Cypher System
* Daggerheart
* A generic profile for doubles on d100 rolls

The starter profiles use general dice patterns, so you may want to adjust them to your table's house rules. They are starting points, not official rule implementations. Most starter triggers come without actions: add the actions you want in the editor. Until then such a trigger does nothing when it matches, it neither asks the GM nor shows a chat button. Only the GM whisper log mode still reports the match.

## Import and export

The manager imports and exports JSON in two ways:

* triggers of the world
* profiles

Imports merge by id or name. Roll tables, macros, journals, scenes, actors and items picked in a trigger may need to be picked again after moving triggers to another world.
