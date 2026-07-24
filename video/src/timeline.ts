export const timeline = {
  brandIntro: { start: 0, duration: 150 },
  todayScene: { start: 90, duration: 270 },
  libraryScene: { start: 360, duration: 300 },
  learningFlowScene: { start: 660, duration: 360 },
  mapChangeScene: { start: 1020, duration: 300 },
  learningMapScene: { start: 1320, duration: 270 },
  agentScene: { start: 1590, duration: 210 },
  brandOutro: { start: 1740, duration: 150 },
} as const;

export const getEnd = (key: keyof typeof timeline) =>
  timeline[key].start + timeline[key].duration;
