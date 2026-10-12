# Sephral's Roll Triggers Manual

Sephral's Roll Triggers watches roll chat messages in Foundry VTT and can run additional house-rule actions when a configured roll condition matches.

The module does not change the roll, reroll dice, or replace your game system's normal resolution. It reacts after a roll exists.

## Requirements

- Foundry VTT v13 or v14
- A world where the module is enabled
- GM permissions for creating triggers and managing profiles

## Opening The Manager

The Trigger Manager can be opened in two ways:

- Module settings: `Trigger manager`
- GM scene toolbar: the Roll Triggers icon on the left toolbar toggles the manager open or closed

The manager contains two areas:

- Configured triggers: active world triggers used during play
- Profiles: reusable trigger bundles that can be imported into the world

## Settings

Important settings:

- Enable roll triggers: turns runtime processing on or off for the world
- Module language: follow Foundry, force German, or force English for module UI text. Follow Foundry uses Foundry's language, including community translations of this module
- Manager theme: Signature or Foundry visual theme
- Default execution mode: default behavior for newly created triggers
- Allow player buttons: lets players see and request chat-button trigger execution on their own rolls and on rolls of actors they own (never on blind rolls)
- Enable import and export: controls JSON import/export buttons
- Show internal presets: shows built-in starter profiles
- Store triggered matches on chat messages: prevents duplicate processing on re-render
- Respect private rolls: keeps follow-up handling private for private or blind rolls. Public actions of a private, self, or blind roll are whispered to the GM instead, and actions of a blind roll never go to players
- Maximum actions per chat message: limits how many actions can run from one message. A trigger whose actions would exceed the limit is skipped

## Trigger Basics

A trigger has four main parts:

- General: name, description, priority, and execution mode
- Match: the dice or roll condition that must be true, plus optional AND conditions
- Filters: optional context restrictions
- Actions: what happens when the trigger matches

Higher priority triggers are evaluated first. If several triggers match the same roll, they can all run unless a trigger is configured to stop lower-priority matches.

A trigger runs at most once per chat message, even when the message holds several rolls, for example a damage card with several damage parts. The first matching roll counts. A trigger export can opt out with `"oncePerMessage": false` or `"allowMultipleMatches": true`, then the trigger runs for every matching roll of the message.

With `Respect private rolls` enabled, a trigger follows the privacy of the roll (`"visibilityMode": "inherit"`, the default). Set `"visibilityMode": "action"` in a trigger export to always use the visibility configured on its actions.

## Match Types

Generic match types include:

- A die shows a specific value
- A die shows its minimum value
- A die shows its maximum value
- At least N dice show a specific value
- At least N dice show minimum values
- At least N dice show maximum values
- All dice of one type show the same value
- At least N dice of one type show the same value
- A die result is above or below a threshold
- The total is above or below a threshold
- A system success degree matches: `critical-success`, `success`, `failure`, or `critical-failure`. PF2e outcomes (`criticalSuccess` or degree 0 to 3) are recognized
- A system flag exists
- A custom JavaScript expression evaluated on the GM client returns true

The editor only shows fields relevant to the selected match type. For example, `Die shows its maximum` only needs die faces. Leave die faces empty to check every die of the roll.

## AND Conditions

Below the main match, `Add AND condition` adds a further condition with its own match type and fields. The trigger only fires when the main match and every added condition are true for the same roll. `Remove condition` deletes one again.

Each condition checks the whole roll on its own. Example for Savage Worlds: main match `Die shows a specific value` with value 1, plus an AND condition `Die shows a specific value` with value 2. To require two dice with the same value, use `At least N dice show a specific value` instead of two identical conditions.

Custom JavaScript conditions are evaluated on the GM client, as for the main match. The trigger list shows all conditions joined with AND. Trigger and profile exports include the AND conditions, and older exports without them still import.

## Filters

Filters narrow when a matching roll is allowed to trigger.

Available filter groups:

- Roll type: attack, check, save, damage, healing, skill, initiative, utility, other
- Actor type: PC, NPC, vehicle
- Roll visibility: public, GM/private, blind, self
- Combat state: in combat or out of combat
- Scene include filter
- Actor include filter
- Item include filter
- Player-only or GM-only user filters

The scene, actor, and item selectors show `Name (ID)` where Foundry provides names.

In D&D 5e, ability and tool checks count as `check`, death saves as `save`, hit dice as `healing`, and hit point and utility formula rolls as `utility`. Initiative rolls from the combat tracker count as `initiative` in every system.

## Actions

Each trigger can hold multiple action slots. Empty actions are ignored.

Supported action types:

- Chat message: posts a templated chat message
- Roll table: draws a selected roll table and posts Foundry's result card with the drawn result, using the action visibility
- Macro: executes a selected macro
- Journal link: posts a chat link to a selected journal entry. With an empty template it posts the trigger name and the link, a written template replaces both (`{{journal.name}}` and `{{journal.uuid}}` are available)
- GM note: sends a note to GMs

Action visibility can be configured where relevant:

- Public
- GM whisper
- Whisper to the affected player

Templates can use simple tokens such as:

- `{{trigger.name}}`
- `{{actor.name}}`
- `{{user.name}}`
- `{{roll.formula}}`
- `{{roll.total}}`
- `{{roll.type}}`
- `{{roll.results}}`

The template itself may contain HTML. Token values such as actor or user names are inserted as plain text.

## Execution Modes

Triggers can execute in several ways:

- Automatic: runs actions immediately
- Ask GM: prompts the GM before running
- Chat button: stores the match on the chat message and shows a run button
- GM whisper log: logs the match privately to GMs
- Disabled: never runs

For player-visible chat buttons, non-GM clicks are relayed to the active GM for execution. Players only get buttons on their own rolls and on rolls of actors they own. If no GM is online, the click shows a warning and nothing runs.

## Profiles

Profiles are reusable bundles of triggers. They can be imported into the active world triggers and exported separately from live triggers.

The module includes starter profiles for several systems, including:

- D&D 5e
- Pathfinder 2e
- DSA5
- Cyberpunk RED
- Call of Cthulhu 7e
- Savage Worlds
- Alien RPG
- Warhammer Fantasy Roleplay 4e
- Fallout 2d20
- Dungeon Crawl Classics
- Blades in the Dark
- Forbidden Lands
- GURPS
- Torg Eternity
- Cypher System
- Daggerheart

Starter profiles use generic dice patterns where possible, so they may still need adjustment for a specific table's house rules.

## Import And Export

The manager supports two JSON workflows:

- Trigger export/import for active world triggers
- Profile export/import for reusable bundles

Imports merge by id or name. World-specific references such as tables, macros, journals, scenes, actors, and items may need reassignment after moving data between worlds.

## Runtime Behavior

Only the active GM processes new chat messages for trigger matching. When several GMs or Assistant GMs are online, Foundry designates one of them as the active GM (the highest role first), and only that client runs actions, shows the `Ask GM` dialog, and handles relayed player clicks. This keeps automation centralized and avoids duplicate execution between connected clients.

The generic adapter reads Foundry roll data from chat messages and extracts:

- Roll formula and total
- Visible dice results
- Dice faces and values
- User, actor, token, item, and scene context where available
- Roll visibility and roll mode
- Combat state
- System id and version
- Raw flags for advanced matching

## Limitations

The module starts from generic Foundry roll data. It can recognize many useful dice patterns, but deep system-specific outcomes depend on what each system stores in roll messages and flags.

Built-in profiles are starter templates, not official rule implementations.
