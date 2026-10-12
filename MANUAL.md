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

## Trigger basics

A trigger has four parts:

* **General:** name, description, priority and execution mode
* **Match:** the dice or roll condition that must be true, plus optional AND conditions
* **Filters:** optional limits on when the trigger may fire
* **Actions:** what happens when the trigger matches

Triggers with a higher priority are checked first. If several triggers match the same roll, they all run, unless a trigger is set to stop the ones after it.

A trigger fires at most once per chat message, even when the message holds several rolls, for example a damage card with several damage parts. The first matching roll counts.

## Match types

* Die shows a specific value
* Die shows its minimum
* Die shows its maximum
* At least N dice show a specific value
* At least N dice show minimum
* At least N dice show maximum
* All dice of a type show the same value
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
* Scenes, actors and items you pick
* Rolls by players only or by the GM only

In D&D 5e, ability and tool checks count as *check*, death saves as *save*, hit dice as *healing*, and hit point and utility rolls as *utility*. Initiative rolls from the combat tracker count as *initiative* in every system.

## Actions

Each trigger can hold several actions. Empty actions are ignored.

* **Chat message:** posts a message from your template
* **Roll table:** draws from a roll table and posts Foundry's result card
* **Macro:** runs a macro
* **Journal link:** posts a link to a journal entry. With an empty template it posts the trigger name and the link, a template of your own replaces both (`{{journal.name}}` and `{{journal.uuid}}` are available)
* **GM note:** sends a note to the GMs

Where it makes sense, an action can be public, whispered to the GM or whispered to the player who rolled.

Templates can use these placeholders:

* `{{trigger.name}}`
* `{{actor.name}}`
* `{{user.name}}`
* `{{roll.formula}}`
* `{{roll.total}}`
* `{{roll.type}}`
* `{{roll.results}}`

Templates may contain HTML. Values such as actor or user names are inserted as plain text.

## Execution modes

* **Automatic:** runs the actions right away
* **Ask GM:** asks the GM first
* **Chat button:** shows a button on the chat message that runs the actions
* **GM whisper log:** only tells the GMs privately that the trigger matched
* **Disabled:** never runs

When a player clicks a chat button, the GM's client runs the actions. Players only get buttons on their own rolls and on rolls of actors they own. If no GM is online, the click shows a warning and nothing runs.

With several GMs or Assistant GMs online, only one of them runs the triggers, so nothing happens twice.

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

The starter profiles use general dice patterns, so you may want to adjust them to your table's house rules. They are starting points, not official rule implementations.

## Import and export

The manager imports and exports JSON in two ways:

* triggers of the world
* profiles

Imports merge by id or name. Roll tables, macros, journals, scenes, actors and items picked in a trigger may need to be picked again after moving triggers to another world.
