// Choice maps shared by the trigger editor and the test bench (values to localization keys below "SRT.").

export const ROLL_TYPE_CHOICES = {
  any: "RollType.Any",
  attack: "RollType.Attack",
  check: "RollType.Check",
  save: "RollType.Save",
  damage: "RollType.Damage",
  healing: "RollType.Healing",
  skill: "RollType.Skill",
  initiative: "RollType.Initiative",
  utility: "RollType.Utility",
  other: "RollType.Other"
};

export const FILTER_VISIBILITY_CHOICES = {
  any: "Visibility.Any",
  public: "Visibility.Public",
  "gm-private": "Visibility.Gm",
  blind: "Visibility.Blind",
  self: "Visibility.Self"
};

export const SUCCESS_DEGREE_CHOICES = {
  "critical-success": "Degree.CriticalSuccess",
  success: "Degree.Success",
  failure: "Degree.Failure",
  "critical-failure": "Degree.CriticalFailure"
};
