function createTrigger(overrides) {
  return {
    id: overrides.id,
    name: overrides.name,
    description: overrides.description ?? "",
    category: overrides.category ?? "house-rule",
    icon: overrides.icon ?? null,
    enabled: overrides.enabled ?? true,
    priority: overrides.priority ?? 100,
    oncePerMessage: overrides.oncePerMessage ?? true,
    allowMultipleMatches: overrides.allowMultipleMatches ?? false,
    stopLowerPriority: overrides.stopLowerPriority ?? false,
    executionMode: overrides.executionMode ?? "confirm-gm",
    visibilityMode: overrides.visibilityMode ?? "inherit",
    match: overrides.match,
    filters: overrides.filters ?? {},
    actions: overrides.actions ?? [],
    source: overrides.source ?? "internal-preset"
  };
}

function createProfile({ id, name, systemId, description, triggers }) {
  return {
    id,
    name,
    systemId,
    description,
    source: "internal-preset",
    editable: false,
    triggers
  };
}

export function getInternalProfiles() {
  return [
    createProfile({
      id: "dnd5e-core",
      name: "D&D 5e Starter",
      systemId: "dnd5e",
      description: "Starter profile for natural 20 and natural 1 house-rule triggers.",
      triggers: [
        createTrigger({
          id: "dnd5e-attack-nat20",
          name: "Natural 20 on attack",
          description: "Starter trigger for critical hit tables on attack rolls.",
          priority: 300,
          match: { type: "die-max", faces: 20, minCount: 1 },
          filters: { rollType: ["attack"] }
        }),
        createTrigger({
          id: "dnd5e-attack-nat1",
          name: "Natural 1 on attack",
          description: "Starter trigger for fumble tables on attack rolls.",
          priority: 290,
          match: { type: "die-min", faces: 20, minCount: 1 },
          filters: { rollType: ["attack"] }
        })
      ]
    }),
    createProfile({
      id: "pf2e-core",
      name: "PF2e Starter",
      systemId: "pf2e",
      description: "Starter profile that can later prefer native success degrees.",
      triggers: [
        createTrigger({
          id: "pf2e-critical-success",
          name: "Critical Success",
          priority: 300,
          match: { type: "success-degree", degree: "critical-success" }
        }),
        createTrigger({
          id: "pf2e-critical-failure",
          name: "Critical Failure",
          priority: 290,
          match: { type: "success-degree", degree: "critical-failure" }
        })
      ]
    }),
    createProfile({
      id: "dsa5-core",
      name: "DSA5 Starter",
      systemId: "dsa5",
      description: "Starter profile for 3d20 criticals and botches.",
      triggers: [
        createTrigger({
          id: "dsa5-two-ones",
          name: "At least two 1s on 3d20",
          priority: 300,
          match: { type: "at-least-n-value", faces: 20, value: 1, minCount: 2 },
          filters: { exactDiceCountByFaces: { 20: 3 } }
        }),
        createTrigger({
          id: "dsa5-two-twenties",
          name: "At least two 20s on 3d20",
          priority: 290,
          match: { type: "at-least-n-value", faces: 20, value: 20, minCount: 2 },
          filters: { exactDiceCountByFaces: { 20: 3 } }
        })
      ]
    }),
    createProfile({
      id: "cyberpunk-red-core",
      name: "Cyberpunk RED Starter",
      systemId: "cyberpunk-red-core",
      description: "Starter profile for natural 10 and natural 1 triggers on d10 rolls.",
      triggers: [
        createTrigger({
          id: "cpr-ten",
          name: "Natural 10 on d10",
          priority: 300,
          match: { type: "die-max", faces: 10, minCount: 1 }
        }),
        createTrigger({
          id: "cpr-one",
          name: "Natural 1 on d10",
          priority: 290,
          match: { type: "die-min", faces: 10, minCount: 1 }
        })
      ]
    }),
    createProfile({
      id: "coc7-core",
      name: "Call of Cthulhu 7e Starter",
      systemId: "CoC7",
      description: "Starter profile for 01 and 100 special d100 outcomes.",
      triggers: [
        createTrigger({
          id: "coc7-01",
          name: "01 on d100",
          priority: 300,
          match: { type: "die-value", faces: 100, value: 1, minCount: 1 }
        }),
        createTrigger({
          id: "coc7-100",
          name: "100 on d100",
          priority: 290,
          match: { type: "die-value", faces: 100, value: 100, minCount: 1 }
        })
      ]
    }),
    createProfile({
      id: "generic-d100-doubles-core",
      name: "Generic d100 Doubles Starter",
      systemId: "generic",
      description: "Starter profile for d100 doubles on skill or check rolls.",
      triggers: [
        createTrigger({
          id: "generic-d100-skill-doubles",
          name: "Doubles on d100 skill check",
          description: "Posts a reminder when a d100 skill or check roll lands on 11, 22, 33, and so on.",
          priority: 300,
          executionMode: "automatic",
          match: {
            type: "custom-js",
            expression: "Number.isInteger(event.total) && event.total >= 11 && event.total <= 99 && event.total % 11 === 0"
          },
          filters: {
            rollType: ["skill", "check"],
            exactDiceCountByFaces: { 100: 1 }
          },
          actions: [{
            type: "chat-message",
            visibility: "public",
            template: "Doubles on d100 ({{roll.total}}). Mark the tested skill for improvement."
          }]
        }),
        createTrigger({
          id: "generic-d100-skill-100",
          name: "100 on d100 skill check",
          description: "Optional companion trigger for groups that want a dedicated 100 reminder beside doubles.",
          priority: 290,
          executionMode: "automatic",
          match: { type: "die-value", faces: 100, value: 100, minCount: 1 },
          filters: {
            rollType: ["skill", "check"],
            exactDiceCountByFaces: { 100: 1 }
          },
          actions: [{
            type: "chat-message",
            visibility: "public",
            template: "100 on d100. Resolve your table's special outcome for this skill roll."
          }]
        })
      ]
    }),
    createProfile({
      id: "swade-core",
      name: "Savage Worlds Starter",
      systemId: "swade",
      description: "Starter profile for Snake Eyes and ace-style maximum die triggers.",
      triggers: [
        createTrigger({
          id: "swade-snake-eyes",
          name: "Snake Eyes",
          priority: 300,
          match: { type: "at-least-n-value", value: 1, minCount: 2 }
        }),
        createTrigger({
          id: "swade-ace",
          name: "At least one ace",
          priority: 290,
          match: { type: "die-max", minCount: 1 }
        })
      ]
    }),
    createProfile({
      id: "alienrpg-core",
      name: "Alien RPG Starter",
      systemId: "alienrpg",
      description: "Starter profile for standout d6 outcomes in Alien RPG rolls.",
      triggers: [
        createTrigger({
          id: "alienrpg-six",
          name: "Natural 6 on d6",
          priority: 300,
          match: { type: "die-max", faces: 6, minCount: 1 }
        }),
        createTrigger({
          id: "alienrpg-one",
          name: "Natural 1 on d6",
          priority: 290,
          match: { type: "die-min", faces: 6, minCount: 1 }
        })
      ]
    }),
    createProfile({
      id: "wfrp4e-core",
      name: "WFRP4e Starter",
      systemId: "wfrp4e",
      description: "Starter profile for extreme d100 outcomes in Warhammer Fantasy Roleplay 4e.",
      triggers: [
        createTrigger({
          id: "wfrp4e-01",
          name: "01 on d100",
          priority: 300,
          match: { type: "die-value", faces: 100, value: 1, minCount: 1 }
        }),
        createTrigger({
          id: "wfrp4e-100",
          name: "100 on d100",
          priority: 290,
          match: { type: "die-value", faces: 100, value: 100, minCount: 1 }
        })
      ]
    }),
    createProfile({
      id: "fallout-core",
      name: "Fallout 2d20 Starter",
      systemId: "fallout",
      description: "Starter profile for natural 1 and 20 d20 outcomes in Fallout rolls.",
      triggers: [
        createTrigger({
          id: "fallout-one",
          name: "Natural 1 on d20",
          priority: 300,
          match: { type: "die-min", faces: 20, minCount: 1 }
        }),
        createTrigger({
          id: "fallout-twenty",
          name: "Natural 20 on d20",
          priority: 290,
          match: { type: "die-max", faces: 20, minCount: 1 }
        })
      ]
    }),
    createProfile({
      id: "dcc-core",
      name: "Dungeon Crawl Classics Starter",
      systemId: "dcc",
      description: "Starter profile for natural 20 and natural 1 d20 outcomes.",
      triggers: [
        createTrigger({
          id: "dcc-nat20",
          name: "Natural 20 on d20",
          priority: 300,
          match: { type: "die-max", faces: 20, minCount: 1 }
        }),
        createTrigger({
          id: "dcc-nat1",
          name: "Natural 1 on d20",
          priority: 290,
          match: { type: "die-min", faces: 20, minCount: 1 }
        })
      ]
    }),
    createProfile({
      id: "bitd-core",
      name: "Blades in the Dark Starter",
      systemId: "bitd",
      description: "Starter profile for standout d6 outcomes in action rolls.",
      triggers: [
        createTrigger({
          id: "bitd-six",
          name: "Natural 6 on d6",
          priority: 300,
          match: { type: "die-max", faces: 6, minCount: 1 }
        }),
        createTrigger({
          id: "bitd-one",
          name: "Natural 1 on d6",
          priority: 290,
          match: { type: "die-min", faces: 6, minCount: 1 }
        })
      ]
    }),
    createProfile({
      id: "forbidden-lands-core",
      name: "Forbidden Lands Starter",
      systemId: "forbidden-lands",
      description: "Starter profile for standout d6 outcomes in Year Zero rolls.",
      triggers: [
        createTrigger({
          id: "forbidden-lands-six",
          name: "Natural 6 on d6",
          priority: 300,
          match: { type: "die-max", faces: 6, minCount: 1 }
        }),
        createTrigger({
          id: "forbidden-lands-one",
          name: "Natural 1 on d6",
          priority: 290,
          match: { type: "die-min", faces: 6, minCount: 1 }
        })
      ]
    }),
    createProfile({
      id: "gurps-core",
      name: "GURPS Starter",
      systemId: "gurps",
      description: "Starter profile for extreme totals on classic 3d6 rolls.",
      triggers: [
        createTrigger({
          id: "gurps-total-3",
          name: "Total 3 on 3d6",
          priority: 300,
          match: { type: "total-below", threshold: 4 },
          filters: { exactDiceCountByFaces: { 6: 3 } }
        }),
        createTrigger({
          id: "gurps-total-18",
          name: "Total 18 on 3d6",
          priority: 290,
          match: { type: "total-above", threshold: 17 },
          filters: { exactDiceCountByFaces: { 6: 3 } }
        })
      ]
    }),
    createProfile({
      id: "torgeternity-core",
      name: "Torg Eternity Starter",
      systemId: "torgeternity",
      description: "Starter profile for natural 20 and natural 1 d20 outcomes.",
      triggers: [
        createTrigger({
          id: "torgeternity-twenty",
          name: "Natural 20 on d20",
          priority: 300,
          match: { type: "die-max", faces: 20, minCount: 1 }
        }),
        createTrigger({
          id: "torgeternity-one",
          name: "Natural 1 on d20",
          priority: 290,
          match: { type: "die-min", faces: 20, minCount: 1 }
        })
      ]
    }),
    createProfile({
      id: "cyphersystem-core",
      name: "Cypher System Starter",
      systemId: "cyphersystem",
      description: "Starter profile for natural 20 and natural 1 d20 outcomes.",
      triggers: [
        createTrigger({
          id: "cyphersystem-twenty",
          name: "Natural 20 on d20",
          priority: 300,
          match: { type: "die-max", faces: 20, minCount: 1 }
        }),
        createTrigger({
          id: "cyphersystem-one",
          name: "Natural 1 on d20",
          priority: 290,
          match: { type: "die-min", faces: 20, minCount: 1 }
        })
      ]
    }),
    createProfile({
      id: "daggerheart-core",
      name: "Daggerheart Starter",
      systemId: "daggerheart",
      description: "Starter profile for standout d12 outcomes on Hope and Fear dice.",
      triggers: [
        createTrigger({
          id: "daggerheart-twelve",
          name: "Natural 12 on d12",
          priority: 300,
          match: { type: "die-max", faces: 12, minCount: 1 }
        }),
        createTrigger({
          id: "daggerheart-one",
          name: "Natural 1 on d12",
          priority: 290,
          match: { type: "die-min", faces: 12, minCount: 1 }
        })
      ]
    })
  ];
}