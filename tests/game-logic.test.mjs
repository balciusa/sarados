import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateScore,
  gameReducer,
  initialGameState,
  pickNextWord,
} from "../app/game-logic.ts";
import { words } from "../app/words.ts";

function readyState() {
  let state = initialGameState;
  state = gameReducer(state, {
    type: "ADD_PLAYER",
    player: { id: "p1", name: "Mantas" },
  });
  state = gameReducer(state, {
    type: "ADD_PLAYER",
    player: { id: "p2", name: "Ieva" },
  });
  state = gameReducer(state, {
    type: "START_GAME",
    now: 1_000,
    word: words[0],
  });
  return state;
}

test("scoring rewards speed and never drops below five for a guess", () => {
  assert.equal(calculateScore(0), 100);
  assert.equal(calculateScore(10_000), 90);
  assert.ok(calculateScore(5_000) > calculateScore(25_000));
  assert.equal(calculateScore(500_000), 5);
});

test("the guesser cannot be the actor and a valid guesser becomes next actor", () => {
  let state = readyState();
  state = gameReducer(state, { type: "REVEAL_WORD", now: 2_000 });
  state = gameReducer(state, { type: "MARK_GUESSED", now: 5_000 });

  const rejected = gameReducer(state, {
    type: "SELECT_GUESSER",
    guesserId: "p1",
    now: 5_100,
  });
  assert.strictEqual(rejected, state);

  state = gameReducer(state, {
    type: "SELECT_GUESSER",
    guesserId: "p2",
    now: 9_000,
  });
  assert.equal(state.attempts[0].durationMs, 3_000);
  assert.equal(state.attempts[0].guesserId, "p2");
  assert.equal(state.scores.p1, 97);
  assert.equal(state.lastResult?.nextActorId, "p2");

  state = gameReducer(state, { type: "CONTINUE", word: words[1] });
  assert.equal(state.phase, "handoff");
  assert.equal(state.currentActorId, "p2");
});

test("pass and timeout record zero and keep the same actor", () => {
  let passed = readyState();
  passed = gameReducer(passed, { type: "REVEAL_WORD", now: 2_000 });
  passed = gameReducer(passed, { type: "PASS", now: 7_000 });
  assert.equal(passed.attempts[0].result, "passed");
  assert.equal(passed.attempts[0].scoreAwarded, 0);
  assert.equal(passed.lastResult?.nextActorId, "p1");

  let timedOut = readyState();
  timedOut = gameReducer(timedOut, { type: "REVEAL_WORD", now: 2_000 });
  timedOut = gameReducer(timedOut, { type: "TIMEOUT", now: 62_000 });
  assert.equal(timedOut.attempts[0].result, "timeout");
  assert.equal(timedOut.attempts[0].scoreAwarded, 0);
  assert.equal(timedOut.lastResult?.nextActorId, "p1");
});

test("rematch preserves players and settings but resets the session", () => {
  let state = readyState();
  state = gameReducer(state, { type: "REVEAL_WORD", now: 2_000 });
  state = gameReducer(state, { type: "PASS", now: 4_000 });
  state = gameReducer(state, { type: "END_GAME" });
  state = gameReducer(state, {
    type: "REMATCH",
    now: 10_000,
    word: words[2],
  });

  assert.deepEqual(
    state.players.map((player) => player.name),
    ["Mantas", "Ieva"],
  );
  assert.equal(state.settings.timerSeconds, 60);
  assert.equal(state.attempts.length, 0);
  assert.deepEqual(state.scores, { p1: 0, p2: 0 });
  assert.equal(state.phase, "handoff");
  assert.equal(state.currentActorId, "p1");
});

test("word selection avoids repeats until the eligible pool is exhausted", () => {
  const pool = words.slice(0, 2);
  const settings = {
    difficulty: "mixed",
    categories: [],
    timerSeconds: 60,
  };
  const first = pickNextWord(pool, settings, [], () => 0);
  const second = pickNextWord(pool, settings, [first.id], () => 0);
  assert.notEqual(second.id, first.id);
  assert.equal(
    pickNextWord(pool, settings, [first.id, second.id], () => 0).id,
    first.id,
  );
});
