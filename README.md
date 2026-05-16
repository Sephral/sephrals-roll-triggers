# Sephral's Roll Triggers

Sephral's Roll Triggers adds configurable house-rule reactions for special roll results in Foundry VTT.

It watches existing roll chat messages, checks them against your trigger rules, and then runs optional follow-up actions. It does not change dice results, reroll dice, or replace your game system's normal roll resolution.

## Features

- Trigger Manager for creating, editing, duplicating, importing, and exporting triggers
- GM toolbar icon for toggling the Trigger Manager
- Match rules for natural highs/lows, exact die values, repeated values, thresholds, totals, success degrees, flags, and GM-only custom expressions
- Optional filters for roll type, actor type, visibility, combat state, scene, actor, item, and GM/player user context
- Actions for chat messages, roll tables, macros, journal links, and GM notes
- Execution modes for automatic runs, GM confirmation, chat buttons, GM whisper logs, or disabled triggers
- Reusable trigger profiles with separate import/export
- Built-in starter profiles for several popular Foundry systems
- English and German UI with a module language setting
- Signature and Foundry manager themes
- Foundry VTT v13 and v14 support

## Examples

- Roll a fumble table when a player rolls a natural 1 on an attack
- Post a critical-hit reminder or draw a critical table on a natural 20
- Send a private GM note when a hidden or blind roll hits a configured threshold
- Show a chat button so the GM can decide later whether a special effect should happen
- Link a journal entry with house rules when a matching roll pattern appears
- Run a macro after rare dice patterns such as doubles, triples, snake eyes, or maximum values

## Documentation

See [MANUAL.md](MANUAL.md) for setup details, trigger concepts, action templates, profiles, settings, and validation commands.
