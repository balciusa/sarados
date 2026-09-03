"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  type Category,
  type Difficulty,
  formatScore,
  gameReducer,
  initialGameState,
  pickNextWord,
} from "./game-logic";
import { words } from "./words";

const difficultyOptions: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "Lengva" },
  { value: "medium", label: "Vidutinė" },
  { value: "hard", label: "Sunki" },
  { value: "mixed", label: "Mišri" },
];

const timerOptions: { value: number | null; label: string }[] = [
  { value: null, label: "Be limito" },
  { value: 30, label: "30 s" },
  { value: 45, label: "45 s" },
  { value: 60, label: "60 s" },
  { value: 90, label: "90 s" },
];

const categoryOptions: { value: Category; label: string }[] = [
  { value: "lithuania", label: "Lietuva" },
  { value: "movies", label: "Filmai ir serialai" },
  { value: "food", label: "Maistas" },
  { value: "animals", label: "Gyvūnai" },
  { value: "objects", label: "Daiktai" },
  { value: "activities", label: "Veiklos" },
];

function formatTime(milliseconds: number, countdown: boolean): string {
  const totalSeconds = countdown
    ? Math.max(0, Math.ceil(milliseconds / 1000))
    : Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0")
  );
}

export function CharadesGame() {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);
  const [name, setName] = useState("");
  const [validation, setValidation] = useState("");
  const [clockNow, setClockNow] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSoundsRef = useRef(new Map<OscillatorNode, GainNode>());
  const firedCueSecondsRef = useRef(new Set<number>());
  const soundEnabledRef = useRef(true);

  const currentActor = state.players.find(
    (player) => player.id === state.currentActorId,
  );
  const standings = useMemo(
    () =>
      state.players
        .map((player, index) => ({
          ...player,
          score: state.scores[player.id] ?? 0,
          order: index,
        }))
        .sort((a, b) => b.score - a.score || a.order - b.order),
    [state.players, state.scores],
  );

  const stopCountdownAudio = useCallback(() => {
    activeSoundsRef.current.forEach((gain, sound) => {
      sound.onended = null;
      try {
        sound.stop();
      } catch {
        // The sound may already have stopped naturally.
      }
      sound.disconnect();
      gain.disconnect();
    });
    activeSoundsRef.current.clear();
  }, []);

  const unlockCountdownAudio = useCallback(() => {
    try {
      const AudioContextConstructor =
        window.AudioContext ??
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!AudioContextConstructor) return null;

      if (
        audioContextRef.current === null ||
        audioContextRef.current.state === "closed"
      ) {
        audioContextRef.current = new AudioContextConstructor();
      }
      if (audioContextRef.current.state === "suspended") {
        void audioContextRef.current.resume().catch(() => undefined);
      }
      return audioContextRef.current;
    } catch {
      return null;
    }
  }, []);

  const playCountdownCue = useCallback((remainingSeconds: number) => {
    if (!soundEnabledRef.current) return;
    const context = audioContextRef.current;
    if (!context || context.state !== "running") return;

    const sound = context.createOscillator();
    const gain = context.createGain();
    const startsAt = context.currentTime;
    const isFinalWarning = remainingSeconds === 1;
    const duration = isFinalWarning ? 0.24 : 0.045;

    sound.type = isFinalWarning ? "sine" : "square";
    sound.frequency.setValueAtTime(isFinalWarning ? 1320 : 820, startsAt);
    if (!isFinalWarning) {
      sound.frequency.exponentialRampToValueAtTime(610, startsAt + duration);
    }
    gain.gain.setValueAtTime(isFinalWarning ? 0.11 : 0.045, startsAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
    sound.connect(gain);
    gain.connect(context.destination);
    activeSoundsRef.current.set(sound, gain);
    sound.onended = () => {
      activeSoundsRef.current.delete(sound);
      sound.disconnect();
      gain.disconnect();
    };
    sound.start(startsAt);
    sound.stop(startsAt + duration);
  }, []);

  useEffect(() => {
    if (state.phase !== "acting" || state.turnStartedAt === null) return;
    const startedAt = state.turnStartedAt;
    const timerSeconds = state.settings.timerSeconds;
    const firedCueSeconds = firedCueSecondsRef.current;
    firedCueSeconds.clear();
    const interval = window.setInterval(() => {
      const now = Date.now();
      setClockNow(now);
      if (timerSeconds !== null) {
        const remainingMs = timerSeconds * 1000 - (now - startedAt);
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        if (
          remainingSeconds >= 1 &&
          remainingSeconds <= 3 &&
          soundEnabledRef.current &&
          !firedCueSeconds.has(remainingSeconds)
        ) {
          firedCueSeconds.add(remainingSeconds);
          playCountdownCue(remainingSeconds);
        }
        if (remainingMs <= 0) {
          window.clearInterval(interval);
          stopCountdownAudio();
          dispatch({ type: "TIMEOUT", now });
        }
      }
    }, 100);
    return () => {
      window.clearInterval(interval);
      firedCueSeconds.clear();
      stopCountdownAudio();
    };
  }, [
    playCountdownCue,
    state.phase,
    state.settings.timerSeconds,
    state.turnStartedAt,
    stopCountdownAudio,
  ]);

  function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setValidation("Įrašyk žaidėjo vardą.");
      return;
    }
    dispatch({
      type: "ADD_PLAYER",
      player: {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : String(Date.now()),
        name: cleanName,
      },
    });
    setName("");
    setValidation("");
  }

  function goToSettings() {
    if (state.players.length < 2) {
      setValidation("Žaidimui reikia bent 2 žaidėjų.");
      return;
    }
    setValidation("");
    dispatch({ type: "GO_TO_SETTINGS" });
  }

  function nextWord() {
    const usedWordIds = state.attempts.map((attempt) => attempt.wordId);
    if (
      state.currentWord &&
      !usedWordIds.includes(state.currentWord.id)
    ) {
      usedWordIds.push(state.currentWord.id);
    }
    return pickNextWord(
      words,
      state.settings,
      usedWordIds,
    );
  }

  function startGame() {
    dispatch({ type: "START_GAME", now: Date.now(), word: nextWord() });
  }

  function revealWord() {
    const now = Date.now();
    if (state.settings.timerSeconds !== null) unlockCountdownAudio();
    setClockNow(now);
    dispatch({ type: "REVEAL_WORD", now });
  }

  function markGuessed() {
    stopCountdownAudio();
    dispatch({ type: "MARK_GUESSED", now: Date.now() });
  }

  function passWord() {
    const now = Date.now();
    stopCountdownAudio();
    if (state.settings.timerSeconds !== null) unlockCountdownAudio();
    setClockNow(now);
    dispatch({ type: "PASS", now, word: nextWord() });
  }

  function continueFromResult() {
    const now = Date.now();
    if (state.lastResult?.result === "timeout") {
      if (state.settings.timerSeconds !== null) unlockCountdownAudio();
      setClockNow(now);
    }
    dispatch({ type: "CONTINUE", now, word: nextWord() });
  }

  function endGame() {
    stopCountdownAudio();
    dispatch({ type: "END_GAME" });
  }

  function toggleSound() {
    const nextEnabled = !soundEnabledRef.current;
    soundEnabledRef.current = nextEnabled;
    setSoundEnabled(nextEnabled);
    if (nextEnabled) {
      unlockCountdownAudio();
    } else {
      stopCountdownAudio();
    }
  }

  function clearCategories() {
    state.settings.categories.forEach((category) => {
      dispatch({ type: "TOGGLE_CATEGORY", category });
    });
  }

  const elapsedMs =
    state.turnStartedAt === null
      ? 0
      : Math.max(0, clockNow - state.turnStartedAt);
  const timed = state.settings.timerSeconds !== null;
  const displayMs = timed
    ? (state.settings.timerSeconds ?? 0) * 1000 - elapsedMs
    : elapsedMs;
  const timerUrgent = timed && displayMs <= 10000;

  return (
    <main className={"app-shell phase-" + state.phase}>
      {state.phase === "home" && (
        <section className="screen home-screen">
          <div className="brand" aria-label="Šarados">
            <span className="brand-mark">Š</span>
            <span>ŠARADOS</span>
          </div>
          <div className="home-copy">
            <p className="eyebrow">VIENAS TELEFONAS. VISA KOMPANIJA.</p>
            <h1>
              Žodis tavo.
              <br />
              Scena irgi.
            </h1>
            <p className="lead">
              Vaidink greitai, rink taškus ir perduok telefoną tam, kas atspėjo.
            </p>
          </div>
          <div className="home-actions">
            <button
              className="button button-primary button-xl"
              onClick={() => dispatch({ type: "GO_TO_PLAYERS" })}
            >
              PRADĖTI ŽAIDIMĄ
              <span aria-hidden="true">→</span>
            </button>
            <p className="hint">2+ žaidėjai · be registracijos</p>
          </div>
        </section>
      )}

      {state.phase === "players" && (
        <section className="screen setup-screen">
          <TopBar title="Žaidėjai" step="1 / 2" />
          <div className="setup-content">
            <div>
              <p className="eyebrow">KAS ŽAIDŽIA?</p>
              <h1>Suburk komandą</h1>
              <p className="muted">Pridėk bent du vardus. Ribų nėra.</p>
            </div>
            <form className="add-player" onSubmit={addPlayer}>
              <label htmlFor="player-name">Žaidėjo vardas</label>
              <div className="input-row">
                <input
                  id="player-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (validation) setValidation("");
                  }}
                  placeholder="Pvz., Mantas"
                  autoComplete="off"
                  enterKeyHint="done"
                />
                <button
                  className="add-button"
                  type="submit"
                  aria-label="Pridėti žaidėją"
                >
                  +
                </button>
              </div>
              {validation && (
                <p className="validation" role="alert">
                  {validation}
                </p>
              )}
            </form>
            <div className="player-list" aria-label="Žaidėjų sąrašas">
              {state.players.map((player, index) => (
                <div className="player-row" key={player.id}>
                  <span className="player-number">{index + 1}</span>
                  <span>{player.name}</span>
                  <button
                    className="remove-button"
                    onClick={() =>
                      dispatch({
                        type: "REMOVE_PLAYER",
                        playerId: player.id,
                      })
                    }
                    aria-label={"Pašalinti žaidėją " + player.name}
                  >
                    ×
                  </button>
                </div>
              ))}
              {state.players.length === 0 && (
                <div className="empty-list">Čia atsiras jūsų žaidėjai.</div>
              )}
            </div>
          </div>
          <footer className="sticky-footer">
            <button className="button button-primary" onClick={goToSettings}>
              TOLIAU <span aria-hidden="true">→</span>
            </button>
          </footer>
        </section>
      )}

      {state.phase === "settings" && (
        <section className="screen setup-screen">
          <TopBar
            title="Nustatymai"
            step="2 / 2"
            onBack={() => dispatch({ type: "BACK_TO_PLAYERS" })}
          />
          <div className="setup-content settings-content">
            <OptionGroup title="Sudėtingumas">
              <div className="choice-grid difficulty-grid">
                {difficultyOptions.map((option) => (
                  <Choice
                    key={option.value}
                    selected={state.settings.difficulty === option.value}
                    onClick={() =>
                      dispatch({
                        type: "SET_DIFFICULTY",
                        difficulty: option.value,
                      })
                    }
                  >
                    {option.label}
                  </Choice>
                ))}
              </div>
            </OptionGroup>
            <OptionGroup title="Laikas">
              <div className="choice-grid timer-grid">
                {timerOptions.map((option) => (
                  <Choice
                    key={String(option.value)}
                    selected={state.settings.timerSeconds === option.value}
                    onClick={() =>
                      dispatch({
                        type: "SET_TIMER",
                        timerSeconds: option.value,
                      })
                    }
                  >
                    {option.label}
                  </Choice>
                ))}
              </div>
            </OptionGroup>
            <OptionGroup title="Kategorijos" note="Galima rinktis kelias">
              <div className="choice-grid category-grid">
                <Choice
                  selected={state.settings.categories.length === 0}
                  onClick={clearCategories}
                >
                  Visos
                </Choice>
                {categoryOptions.map((option) => (
                  <Choice
                    key={option.value}
                    selected={state.settings.categories.includes(option.value)}
                    onClick={() =>
                      dispatch({
                        type: "TOGGLE_CATEGORY",
                        category: option.value,
                      })
                    }
                  >
                    {option.label}
                  </Choice>
                ))}
              </div>
            </OptionGroup>
          </div>
          <footer className="sticky-footer">
            <button className="button button-primary" onClick={startGame}>
              PRADĖTI <span aria-hidden="true">→</span>
            </button>
          </footer>
        </section>
      )}

      {state.phase === "handoff" && currentActor && (
        <section className="screen game-screen handoff-screen">
          <GameTopBar
            attemptCount={state.attempts.length}
            onScores={() => dispatch({ type: "TOGGLE_SCOREBOARD" })}
            onEnd={endGame}
            soundEnabled={timed ? soundEnabled : undefined}
            onToggleSound={timed ? toggleSound : undefined}
          />
          <div className="handoff-content">
            <div className="privacy-icon" aria-hidden="true">
              ↗
            </div>
            <p className="eyebrow">PERDUOK TELEFONĄ</p>
            <h1>
              Dabar vaidina
              <br />
              <strong>{currentActor.name}</strong>
            </h1>
            <p className="muted">
              Tik {currentActor.name} turėtų matyti kitą ekraną.
            </p>
          </div>
          <footer className="game-footer">
            <button
              className="button button-primary button-xl"
              onClick={revealWord}
            >
              RODYTI ŽODĮ
            </button>
          </footer>
        </section>
      )}

      {state.phase === "acting" && currentActor && state.currentWord && (
        <section className="screen game-screen acting-screen">
          <GameTopBar
            actor={currentActor.name}
            attemptCount={state.attempts.length}
            onScores={() => dispatch({ type: "TOGGLE_SCOREBOARD" })}
            onEnd={endGame}
            soundEnabled={timed ? soundEnabled : undefined}
            onToggleSound={timed ? toggleSound : undefined}
          />
          <div className="timer-wrap">
            <span className={"timer" + (timerUrgent ? " urgent" : "")}>
              {formatTime(displayMs, timed)}
            </span>
            <span className="timer-label">{timed ? "liko" : "praėjo"}</span>
          </div>
          <div className="word-wrap">
            <p className="eyebrow">VAIDINK</p>
            <h1>{state.currentWord.text}</h1>
          </div>
          <div className="acting-actions">
            <button
              className="button guessed-button"
              onClick={markGuessed}
            >
              <span aria-hidden="true">✓</span> ATSPĖJO
            </button>
            <button
              className="button pass-button"
              onClick={passWord}
            >
              KITAS ŽODIS
            </button>
          </div>
        </section>
      )}

      {state.phase === "guessing" && currentActor && (
        <section className="screen game-screen guesser-screen">
          <GameTopBar
            actor={currentActor.name}
            attemptCount={state.attempts.length}
            onScores={() => dispatch({ type: "TOGGLE_SCOREBOARD" })}
            onEnd={endGame}
            soundEnabled={timed ? soundEnabled : undefined}
            onToggleSound={timed ? toggleSound : undefined}
          />
          <div className="guesser-heading">
            <p className="eyebrow">ŽODIS ATSPĖTAS</p>
            <h1>Kas atspėjo?</h1>
            <p className="muted">Šis žmogus vaidins kitą žodį.</p>
          </div>
          <div className="guesser-list">
            {state.players
              .filter((player) => player.id !== state.currentActorId)
              .map((player) => (
                <button
                  className="guesser-button"
                  key={player.id}
                  onClick={() =>
                    dispatch({
                      type: "SELECT_GUESSER",
                      guesserId: player.id,
                      now: Date.now(),
                    })
                  }
                >
                  <span>{player.name}</span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
          </div>
        </section>
      )}

      {state.phase === "result" && state.lastResult && (
        <section className="screen game-screen result-screen">
          <GameTopBar
            actor={
              state.lastResult.result === "timeout"
                ? currentActor?.name
                : undefined
            }
            attemptCount={state.attempts.length}
            onScores={() => dispatch({ type: "TOGGLE_SCOREBOARD" })}
            onEnd={endGame}
            soundEnabled={timed ? soundEnabled : undefined}
            onToggleSound={timed ? toggleSound : undefined}
          />
          {state.lastResult.result === "timeout" ? (
            <>
              <div className="result-content timeout-content">
                <div className="result-mark neutral" aria-hidden="true">
                  00
                </div>
                <h1>LAIKAS BAIGĖSI</h1>
              </div>
              <footer className="game-footer">
                <button
                  className="button button-primary button-xl"
                  onClick={continueFromResult}
                >
                  KITAS ŽODIS
                </button>
              </footer>
            </>
          ) : (
            <>
              <div className="result-content">
                <div className="result-mark success" aria-hidden="true">
                  ✓
                </div>
                <p className="eyebrow">ATSPĖTA</p>
                <h1>Puiku!</h1>
                <p className="score-earned">
                  +{formatScore(state.lastResult.scoreAwarded)}{" "}
                  <span>tšk.</span>
                </p>
                <p className="next-actor">
                  Toliau vaidina{" "}
                  <strong>
                    {
                      state.players.find(
                        (player) =>
                          player.id === state.lastResult?.nextActorId,
                      )?.name
                    }
                  </strong>
                </p>
              </div>
              <footer className="game-footer">
                <button
                  className="button button-primary button-xl"
                  onClick={continueFromResult}
                >
                  PERDUOTI TELEFONĄ <span aria-hidden="true">→</span>
                </button>
              </footer>
            </>
          )}
        </section>
      )}

      {state.phase === "finished" && (
        <section className="screen final-screen">
          <div className="final-header">
            <div className="brand compact">
              <span className="brand-mark">Š</span>
              <span>ŠARADOS</span>
            </div>
            <p className="eyebrow">ŽAIDIMAS BAIGTAS</p>
            <h1>Galutinė lentelė</h1>
            <p className="muted">
              {state.attempts.length} sužaisti žodžiai
            </p>
          </div>
          <div className="podium">
            {standings.map((player, index) => (
              <div
                className={"ranking-row rank-" + (index + 1)}
                key={player.id}
              >
                <span className="rank">{index + 1}</span>
                <span className="ranking-name">
                  {player.name}
                  {index === 0 && <small> Nugalėtojas</small>}
                </span>
                <strong>
                  {formatScore(player.score)} <small>tšk.</small>
                </strong>
              </div>
            ))}
          </div>
          <footer className="final-actions">
            <button
              className="button button-primary button-xl"
              onClick={() =>
                dispatch({
                  type: "REMATCH",
                  now: Date.now(),
                  word: pickNextWord(words, state.settings, []),
                })
              }
            >
              REVANŠAS
            </button>
            <button
              className="text-button"
              onClick={() => dispatch({ type: "RETURN_TO_SETUP" })}
            >
              Keisti žaidėjus
            </button>
          </footer>
        </section>
      )}

      {state.scoreboardOpen && state.phase !== "finished" && (
        <div className="modal-backdrop">
          <section
            className="score-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="score-title"
          >
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-header">
              <div>
                <p className="eyebrow">DABAR</p>
                <h2 id="score-title">Rezultatai</h2>
              </div>
              <button
                className="close-button"
                onClick={() =>
                  dispatch({ type: "TOGGLE_SCOREBOARD", open: false })
                }
                aria-label="Uždaryti rezultatus"
              >
                ×
              </button>
            </div>
            <div className="score-list">
              {standings.map((player, index) => (
                <div className="score-row" key={player.id}>
                  <span>{index + 1}</span>
                  <strong>{player.name}</strong>
                  <b>{formatScore(player.score)}</b>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function TopBar({
  title,
  step,
  onBack,
}: {
  title: string;
  step: string;
  onBack?: () => void;
}) {
  return (
    <header className="top-bar">
      {onBack ? (
        <button className="back-button" onClick={onBack} aria-label="Grįžti">
          ←
        </button>
      ) : (
        <span className="brand-mark small">Š</span>
      )}
      <strong>{title}</strong>
      <span className="step">{step}</span>
    </header>
  );
}

function GameTopBar({
  actor,
  attemptCount,
  onScores,
  onEnd,
  soundEnabled,
  onToggleSound,
}: {
  actor?: string;
  attemptCount: number;
  onScores: () => void;
  onEnd: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
}) {
  return (
    <header className="game-top-bar">
      <div>
        {actor ? (
          <span>
            Vaidina <strong>{actor}</strong>
          </span>
        ) : (
          <span>Žodis {attemptCount + 1}</span>
        )}
      </div>
      <div className="game-top-actions">
        {onToggleSound && (
          <button
            className="sound-toggle"
            onClick={onToggleSound}
            aria-label={soundEnabled ? "Išjungti garsą" : "Įjungti garsą"}
            aria-pressed={soundEnabled}
          >
            <span aria-hidden="true">{soundEnabled ? "🔊" : "🔇"}</span>
          </button>
        )}
        <button onClick={onScores}>Taškai</button>
        <button className="end-button" onClick={onEnd}>
          Baigti
        </button>
      </div>
    </header>
  );
}

function OptionGroup({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="option-group">
      <div className="option-heading">
        <h2>{title}</h2>
        {note && <span>{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={"choice" + (selected ? " selected" : "")}
      onClick={onClick}
      aria-pressed={selected}
    >
      {children}
      {selected && <span aria-hidden="true">✓</span>}
    </button>
  );
}
