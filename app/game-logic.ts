import type { WordCard } from "./words";

export type Difficulty = "easy" | "medium" | "hard" | "mixed";
export type Category =
  | "lithuania"
  | "movies"
  | "food"
  | "animals"
  | "objects"
  | "activities";
export type GamePhase =
  | "home"
  | "players"
  | "settings"
  | "handoff"
  | "acting"
  | "guessing"
  | "result"
  | "finished";

export type Player = { id: string; name: string };
export type Settings = {
  difficulty: Difficulty;
  categories: Category[];
  timerSeconds: number | null;
};
export type AttemptResult = "guessed" | "passed" | "timeout";
export type Attempt = {
  id: string;
  wordId: string;
  actorId: string;
  guesserId: string | null;
  result: AttemptResult;
  durationMs: number;
  difficulty: Exclude<Difficulty, "mixed">;
  participantCount: number;
  scoreAwarded: number;
  recordedAt: number;
};
export type TurnResult = {
  result: AttemptResult;
  actorId: string;
  nextActorId: string;
  scoreAwarded: number;
  wordText: string;
};

export type GameState = {
  phase: GamePhase;
  players: Player[];
  settings: Settings;
  currentActorId: string | null;
  currentWord: WordCard | null;
  attempts: Attempt[];
  scores: Record<string, number>;
  sessionStartedAt: number | null;
  turnStartedAt: number | null;
  pendingDurationMs: number | null;
  lastResult: TurnResult | null;
  scoreboardOpen: boolean;
};

export type GameAction =
  | { type: "GO_TO_PLAYERS" }
  | { type: "ADD_PLAYER"; player: Player }
  | { type: "REMOVE_PLAYER"; playerId: string }
  | { type: "GO_TO_SETTINGS" }
  | { type: "BACK_TO_PLAYERS" }
  | { type: "SET_DIFFICULTY"; difficulty: Difficulty }
  | { type: "SET_TIMER"; timerSeconds: number | null }
  | { type: "TOGGLE_CATEGORY"; category: Category }
  | { type: "START_GAME"; now: number; word: WordCard }
  | { type: "REVEAL_WORD"; now: number }
  | { type: "MARK_GUESSED"; now: number }
  | { type: "SELECT_GUESSER"; guesserId: string; now: number }
  | { type: "PASS"; now: number }
  | { type: "TIMEOUT"; now: number }
  | { type: "CONTINUE"; word: WordCard }
  | { type: "TOGGLE_SCOREBOARD"; open?: boolean }
  | { type: "END_GAME" }
  | { type: "REMATCH"; now: number; word: WordCard }
  | { type: "RETURN_TO_SETUP" };

export const initialSettings: Settings = {
  difficulty: "mixed",
  categories: [],
  timerSeconds: 60,
};

export const initialGameState: GameState = {
  phase: "home",
  players: [],
  settings: initialSettings,
  currentActorId: null,
  currentWord: null,
  attempts: [],
  scores: {},
  sessionStartedAt: null,
  turnStartedAt: null,
  pendingDurationMs: null,
  lastResult: null,
  scoreboardOpen: false,
};

export function calculateScore(durationMs: number): number {
  return Math.max(
    5,
    Math.round((100 - Math.max(0, durationMs) / 1000) * 10) / 10,
  );
}

export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

export function getEligibleWords(
  words: WordCard[],
  settings: Settings,
): WordCard[] {
  return words.filter((word) => {
    const difficultyMatches =
      settings.difficulty === "mixed" ||
      word.difficulty === settings.difficulty;
    const categoryMatches =
      settings.categories.length === 0 ||
      word.categories.some((category) => settings.categories.includes(category));
    return difficultyMatches && categoryMatches;
  });
}

export function pickNextWord(
  words: WordCard[],
  settings: Settings,
  usedWordIds: string[],
  random = Math.random,
): WordCard {
  const eligible = getEligibleWords(words, settings);
  if (eligible.length === 0) {
    throw new Error("Nėra žodžių pagal pasirinktus nustatymus.");
  }
  const unused = eligible.filter((word) => !usedWordIds.includes(word.id));
  const pool = unused.length > 0 ? unused : eligible;
  return pool[Math.floor(random() * pool.length)] ?? pool[0];
}

function resetScores(players: Player[]): Record<string, number> {
  return Object.fromEntries(players.map((player) => [player.id, 0]));
}

function elapsed(state: GameState, now: number): number {
  return state.turnStartedAt === null ? 0 : Math.max(0, now - state.turnStartedAt);
}

function finishAttempt(
  state: GameState,
  result: AttemptResult,
  guesserId: string | null,
  now: number,
): GameState {
  if (!state.currentWord || !state.currentActorId) return state;
  const durationMs = elapsed(state, now);
  const scoreAwarded = result === "guessed" ? calculateScore(durationMs) : 0;
  const nextActorId = guesserId ?? state.currentActorId;
  const attempt: Attempt = {
    id: String(state.sessionStartedAt ?? now) + "-" + String(state.attempts.length + 1),
    wordId: state.currentWord.id,
    actorId: state.currentActorId,
    guesserId,
    result,
    durationMs,
    difficulty: state.currentWord.difficulty,
    participantCount: state.players.length,
    scoreAwarded,
    recordedAt: now,
  };
  return {
    ...state,
    phase: "result",
    attempts: [...state.attempts, attempt],
    scores: {
      ...state.scores,
      [state.currentActorId]:
        (state.scores[state.currentActorId] ?? 0) + scoreAwarded,
    },
    turnStartedAt: null,
    pendingDurationMs: null,
    lastResult: {
      result,
      actorId: state.currentActorId,
      nextActorId,
      scoreAwarded,
      wordText: state.currentWord.text,
    },
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "GO_TO_PLAYERS":
      return { ...state, phase: "players" };
    case "ADD_PLAYER":
      return {
        ...state,
        players: [...state.players, action.player],
        scores: { ...state.scores, [action.player.id]: 0 },
      };
    case "REMOVE_PLAYER": {
      const players = state.players.filter((player) => player.id !== action.playerId);
      const scores = { ...state.scores };
      delete scores[action.playerId];
      return { ...state, players, scores };
    }
    case "GO_TO_SETTINGS":
      return state.players.length >= 2 ? { ...state, phase: "settings" } : state;
    case "BACK_TO_PLAYERS":
      return { ...state, phase: "players" };
    case "SET_DIFFICULTY":
      return {
        ...state,
        settings: { ...state.settings, difficulty: action.difficulty },
      };
    case "SET_TIMER":
      return {
        ...state,
        settings: { ...state.settings, timerSeconds: action.timerSeconds },
      };
    case "TOGGLE_CATEGORY": {
      const selected = state.settings.categories;
      const categories = selected.includes(action.category)
        ? selected.filter((category) => category !== action.category)
        : [...selected, action.category];
      return { ...state, settings: { ...state.settings, categories } };
    }
    case "START_GAME":
      if (state.players.length < 2) return state;
      return {
        ...state,
        phase: "handoff",
        currentActorId: state.players[0].id,
        currentWord: action.word,
        attempts: [],
        scores: resetScores(state.players),
        sessionStartedAt: action.now,
        turnStartedAt: null,
        pendingDurationMs: null,
        lastResult: null,
        scoreboardOpen: false,
      };
    case "REVEAL_WORD":
      return state.phase === "handoff"
        ? { ...state, phase: "acting", turnStartedAt: action.now }
        : state;
    case "MARK_GUESSED":
      return state.phase === "acting"
        ? {
            ...state,
            phase: "guessing",
            pendingDurationMs: elapsed(state, action.now),
          }
        : state;
    case "SELECT_GUESSER": {
      if (
        state.phase !== "guessing" ||
        action.guesserId === state.currentActorId ||
        !state.players.some((player) => player.id === action.guesserId)
      ) {
        return state;
      }
      const effectiveNow =
        state.turnStartedAt === null
          ? action.now
          : state.turnStartedAt + (state.pendingDurationMs ?? 0);
      return finishAttempt(state, "guessed", action.guesserId, effectiveNow);
    }
    case "PASS":
      return state.phase === "acting"
        ? finishAttempt(state, "passed", null, action.now)
        : state;
    case "TIMEOUT":
      return state.phase === "acting"
        ? finishAttempt(state, "timeout", null, action.now)
        : state;
    case "CONTINUE":
      if (state.phase !== "result" || !state.lastResult) return state;
      return {
        ...state,
        phase: "handoff",
        currentActorId: state.lastResult.nextActorId,
        currentWord: action.word,
        turnStartedAt: null,
        pendingDurationMs: null,
        lastResult: null,
      };
    case "TOGGLE_SCOREBOARD":
      return {
        ...state,
        scoreboardOpen: action.open ?? !state.scoreboardOpen,
      };
    case "END_GAME":
      return {
        ...state,
        phase: "finished",
        scoreboardOpen: false,
        turnStartedAt: null,
      };
    case "REMATCH":
      if (state.players.length < 2) return state;
      return {
        ...state,
        phase: "handoff",
        currentActorId: state.players[0].id,
        currentWord: action.word,
        attempts: [],
        scores: resetScores(state.players),
        sessionStartedAt: action.now,
        turnStartedAt: null,
        pendingDurationMs: null,
        lastResult: null,
        scoreboardOpen: false,
      };
    case "RETURN_TO_SETUP":
      return {
        ...state,
        phase: "players",
        currentActorId: null,
        currentWord: null,
        attempts: [],
        scores: resetScores(state.players),
        sessionStartedAt: null,
        turnStartedAt: null,
        pendingDurationMs: null,
        lastResult: null,
        scoreboardOpen: false,
      };
    default:
      return state;
  }
}
