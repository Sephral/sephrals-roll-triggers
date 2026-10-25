# Sephral’s Roll Triggers Manual

This manual covers the details. For a quick overview see the [README](README.md).

Roll Triggers watches the rolls in the chat and runs your house rule actions when a roll matches. It never changes a roll, never rerolls dice and does not replace your game system's own resolution. It only reacts after the roll is there.

## Requirements

* Foundry VTT v13 or v14
* GM permissions for creating triggers and managing profiles

## Opening the manager

* In the module settings: `Trigger manager`
* In the scene controls on the left: the Roll Triggers icon opens and closes the manager

The manager has two areas:

* **Configured triggers:** the triggers active in this world
* **Profiles:** ready made bundles of triggers you can import into the world

## Settings

* **Enable roll triggers:** turns the triggers on or off for the world
* **Module language:** follow Foundry (including community translations), German or English
* **Manager theme:** Signature or Foundry look
* **Default execution mode:** the execution mode for new triggers
* **Allow player buttons:** players can use trigger chat buttons on their own rolls and on rolls of actors they own (never on blind rolls)
* **Enable import and export:** shows the import and export buttons
* **Show internal presets:** shows the included starter profiles
* **Store triggered matches on chat messages:** remembers which messages already fired, so a trigger never fires twice for the same message
* **Respect private rolls:** private, self and blind rolls stay private. Public actions of such rolls are whispered to the GM instead, and actions of a blind roll never go to players
* **Maximum actions per chat message:** limits how many actions one message can start. A trigger whose actions would go over the limit is skipped
* **Run self test:** checks the stored triggers and profiles, runs a test roll through every trigger and checks the manager window. Run it after every update of Foundry or the system. When a newer version than the tested one is installed, the GM gets a notice once. Macros call it as `game.modules.get("sephrals-roll-triggers").api.runSelfTest()`

The gear in the title bar of the manager and the test bench opens these settings.

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The question lists everything the report contains, from the Foundry version to a random world ID. For Roll Triggers it holds:

* on how many of the last 30 days the module was used
* how often triggers fire, chat buttons of a trigger are used, triggers are created, copied or edited, profiles are imported, files are imported or exported and the test bench is opened
* the settings *Manager theme*, *Default execution mode* and *Allow player buttons* (only the chosen option)
* where errors occur in the module code: file, line and error type, never the error message

No names, chat messages, notes, dice results or other content of the world are sent.

## Trigger basics

A trigger has four parts:

* **General:** name, description, priority and execution mode
* **Match:** the dice or roll condition that must be true, plus optional AND conditions
* **Filters:** optional limits on when the trigger may fire
* **Actions:** what happens when the trigger matches

Triggers with a higher priority are checked first. If several triggers match the same roll, they all run, unless a trigger is set to stop the ones after it.

A trigger fires at most once per chat message, even when the message holds several rolls, for example a damage card with several damage parts. The first matching roll counts.

Some modules post a card first and add its rolls a moment later, for example Ready Set Roll and MidiQOL. Roll Triggers checks such rolls when they arrive, each roll once.

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
* **Roll table:** draws from a roll table and posts Foundry's result card
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

## Profiles

Profiles are bundles of triggers. Import one into the world, or export your own to use it elsewhere.

Starter profiles are included for:

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
