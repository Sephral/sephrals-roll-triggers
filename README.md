# Sephral's Roll Triggers

Sephral's Roll Triggers adds configurable house-rule reactions for special roll results in Foundry VTT.

It watches existing roll chat messages, checks them against your trigger rules, and then runs optional follow-up actions. It does not change dice results, reroll dice, or replace your game system's normal roll resolution.

## Discord

[![Join Discord](https://img.shields.io/badge/Discord-Join%20the%20community-5865F2?logo=discord&logoColor=white)](https://discord.gg/7BjCgDYaBP)

Questions, feedback, and module support are welcome on [Discord](https://discord.gg/7BjCgDYaBP).

## Features

- Trigger Manager for creating, editing, duplicating, importing, and exporting triggers
- Tabbed trigger editor with resizable dialog sizing and Signature or Foundry visual themes
- GM toolbar icon for toggling the Trigger Manager
- Match rules for natural highs/lows, exact die values, repeated values, thresholds, totals, success degrees, flags, and custom expressions evaluated on the GM processing client
- Optional filters for roll type, actor type, visibility, combat state, scene, actor, item, and GM/player user context, including multi-value filter editing in the trigger dialog
- Actions for chat messages, roll tables, macros, journal links, and GM notes
- Execution modes for automatic runs, GM confirmation, chat buttons, GM whisper logs, or disabled triggers
- Reusable trigger profiles with separate import/export
- Built-in starter profiles for several popular Foundry systems, including a generic d100 doubles preset for skill/check rolls
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
- Post an improvement reminder when a d100 skill or check roll lands on doubles such as 11, 22, or 33

## Documentation

See [MANUAL.md](MANUAL.md) for setup details, trigger concepts, action templates, profiles, settings, and validation commands.
