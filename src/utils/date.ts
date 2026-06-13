export const formatDateLabel = (date: string): string => {
  if (!date || date === "TBD") return "TBD";

  const parsedDate = new Date(`${date}T12:00:00`);

  if (Number.isNaN(parsedDate.getTime())) return date;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric"
  }).format(parsedDate);
};

export const formatRoundLabel = (round: string): string => {
  if (!round) return "ROUND";
  return round.replace("R", "ROUND ");
};
