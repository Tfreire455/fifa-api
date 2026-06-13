import { getGroups } from "./databaseService.js";
import { listMatches } from "./matchService.js";
import { listTeams } from "./teamService.js";

export const listGroups = () => {
  return getGroups();
};

export const findGroupByLetter = (letter: string) => {
  return getGroups().find(
    (group) => group.letter?.toLowerCase() === letter.toLowerCase()
  );
};

export const getGroupWithTeams = (letter: string) => {
  const group = findGroupByLetter(letter);

  if (!group) return null;

  const teams = listTeams({ group: letter });
  const matches = listMatches({ group: letter });

  return {
    ...group,
    teams,
    matches
  };
};
