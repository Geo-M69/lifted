"use client";

import { useMemo, useReducer, useState } from "react";

type Phase = "ROUND_SETUP" | "OPERATOR_ACTION" | "RESOLUTION" | "GAME_OVER";
type Outcome = "SUCCESS" | "ERROR";
type PanelSymbol = "CIRCLE" | "SQUARE" | "TRIANGLE" | "STAR";
type BeamPosition = "LEFT" | "CENTER" | "RIGHT";
type PanelStatus = "STABLE" | "FLICKERING" | "ALERT";
type MalfunctionId = "REVERSED_CONTROLS" | "DOUBLE_INPUT_REQUIRED" | "SYMBOL_SCRAMBLE";

interface ScenarioCard {
  id: number;
  title: string;
  text: string;
  symbols: PanelSymbol[];
  status: PanelStatus;
  triggers: string[];
}

interface Malfunction {
  id: MalfunctionId;
  name: string;
  description: string;
}

interface ResolutionRecord {
  round: number;
  scenarioId: number;
  scenarioTitle: string;
  outcome: Outcome;
  details: string[];
  expectedSequence: PanelSymbol[];
  actualSequence: PanelSymbol[];
  malfunctionDrawn: MalfunctionId | null;
}

interface RoundLogEntry {
  round: number;
  scenarioId: number;
  scenarioTitle: string;
  outcome: Outcome;
  malfunctionDrawn: MalfunctionId | null;
}

interface GameState {
  phase: Phase;
  round: number;
  progress: number;
  errors: number;
  winTarget: number;
  lossTarget: number;
  autoDrawMalfunction: boolean;
  currentScenarioId: number | null;
  panelStatus: PanelStatus;
  startingBeam: BeamPosition;
  selectedBeam: BeamPosition;
  buttonLog: PanelSymbol[];
  activeMalfunctions: MalfunctionId[];
  malfunctionDeck: MalfunctionId[];
  malfunctionDiscard: MalfunctionId[];
  lastResolution: ResolutionRecord | null;
  roundHistory: RoundLogEntry[];
  outcomeText: string | null;
}

type Action =
  | { type: "START_ROUND"; scenarioId: number }
  | { type: "SET_BEAM"; beam: BeamPosition }
  | { type: "PRESS_SYMBOL"; symbol: PanelSymbol }
  | { type: "CLEAR_QUEUE" }
  | { type: "SUBMIT_ROUND" }
  | { type: "NEXT_ROUND" }
  | { type: "TOGGLE_ACTIVE_MALFUNCTION"; id: MalfunctionId }
  | { type: "CLEAR_ACTIVE_MALFUNCTION"; id: MalfunctionId }
  | { type: "SET_AUTO_DRAW_MALFUNCTION"; value: boolean }
  | { type: "RESTART_MISSION" };

const WIN_TARGET = 5;
const LOSS_TARGET = 5;
const MAX_HISTORY = 8;

const SYMBOL_LABEL: Record<PanelSymbol, string> = {
  CIRCLE: "Circle",
  SQUARE: "Square",
  TRIANGLE: "Triangle",
  STAR: "Star",
};

const SYMBOL_GLYPH: Record<PanelSymbol, string> = {
  CIRCLE: "○",
  SQUARE: "□",
  TRIANGLE: "△",
  STAR: "★",
};

const STATUS_LABEL: Record<PanelStatus, string> = {
  STABLE: "Stable",
  FLICKERING: "Flickering",
  ALERT: "Alert",
};

const BEAM_LABEL: Record<BeamPosition, string> = {
  LEFT: "Left",
  CENTER: "Center",
  RIGHT: "Right",
};

const RULE_A_PAIR_MAP: Record<string, PanelSymbol> = {
  CIRCLE_TRIANGLE: "SQUARE",
  SQUARE_STAR: "TRIANGLE",
  TRIANGLE_CIRCLE: "STAR",
  STAR_CIRCLE: "SQUARE",
};

const RULE_B_SINGLE_MAP: Record<PanelSymbol, PanelSymbol> = {
  CIRCLE: "TRIANGLE",
  SQUARE: "CIRCLE",
  TRIANGLE: "STAR",
  STAR: "SQUARE",
};

const FLICKER_REVERSE_MAP: Record<PanelSymbol, PanelSymbol> = {
  CIRCLE: "SQUARE",
  SQUARE: "STAR",
  TRIANGLE: "CIRCLE",
  STAR: "TRIANGLE",
};

const SCENARIO_CARDS: readonly ScenarioCard[] = [
  {
    id: 1,
    title: "Restless Sleeper",
    text: "The human shifts under the blanket, turning slowly.",
    symbols: ["CIRCLE", "TRIANGLE"],
    status: "STABLE",
    triggers: ["Shifts -> Apply beam rule"],
  },
  {
    id: 2,
    title: "Snoring Loudly",
    text: "A deep, rumbling snore echoes through the room.",
    symbols: ["SQUARE"],
    status: "FLICKERING",
    triggers: ["Noise -> Status is Flickering"],
  },
  {
    id: 3,
    title: "Dog Nearby",
    text: "A small dog paces near the bed, growling softly.",
    symbols: ["TRIANGLE", "CIRCLE"],
    status: "FLICKERING",
    triggers: ["Disturbance -> Status is Flickering"],
  },
  {
    id: 4,
    title: "Sudden Movement",
    text: "The human jerks suddenly, almost waking up.",
    symbols: ["STAR"],
    status: "ALERT",
    triggers: ["Movement -> Apply beam rule", "Danger -> Status is Alert"],
  },
  {
    id: 5,
    title: "Flashing Lights",
    text: "The room lights flicker rapidly, then dim.",
    symbols: ["SQUARE", "STAR"],
    status: "FLICKERING",
    triggers: ["Flicker -> Status is Flickering"],
  },
  {
    id: 6,
    title: "Calm Environment",
    text: "The room is quiet. The human sleeps peacefully.",
    symbols: ["CIRCLE"],
    status: "STABLE",
    triggers: ["No status change"],
  },
  {
    id: 7,
    title: "Rolling Over",
    text: "The human rolls to one side, pulling the blanket.",
    symbols: ["STAR", "CIRCLE"],
    status: "STABLE",
    triggers: ["Movement -> Apply beam rule"],
  },
  {
    id: 8,
    title: "Alarm Clock Buzz",
    text: "A faint buzzing begins from across the room.",
    symbols: ["TRIANGLE"],
    status: "FLICKERING",
    triggers: ["Noise -> Status is Flickering"],
  },
  {
    id: 9,
    title: "Near Detection",
    text: "The human stirs violently. This is dangerous.",
    symbols: ["SQUARE", "TRIANGLE"],
    status: "ALERT",
    triggers: ["Danger -> Status is Alert"],
  },
  {
    id: 10,
    title: "Perfect Opportunity",
    text: "The human is completely still. This is your chance.",
    symbols: ["STAR"],
    status: "STABLE",
    triggers: ["No status change"],
  },
];

const MALFUNCTIONS: readonly Malfunction[] = [
  {
    id: "REVERSED_CONTROLS",
    name: "Reversed Controls",
    description: "Beam left/right are swapped.",
  },
  {
    id: "DOUBLE_INPUT_REQUIRED",
    name: "Double Input Required",
    description: "Every required button press must be entered twice.",
  },
  {
    id: "SYMBOL_SCRAMBLE",
    name: "Symbol Scramble",
    description: "Ignore Rule A pair mapping and use Rule B on first symbol.",
  },
];

const MALFUNCTION_IDS = MALFUNCTIONS.map((entry) => entry.id);

function getScenarioById(id: number): ScenarioCard {
  const scenario = SCENARIO_CARDS.find((card) => card.id === id);
  if (!scenario) {
    throw new Error(`Unknown scenario: ${id}`);
  }
  return scenario;
}

function getMalfunctionById(id: MalfunctionId): Malfunction {
  const malfunction = MALFUNCTIONS.find((entry) => entry.id === id);
  if (!malfunction) {
    throw new Error(`Unknown malfunction: ${id}`);
  }
  return malfunction;
}

function shuffle<T>(values: readonly T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j] as T;
    copy[j] = temp as T;
  }
  return copy;
}

function randomBeam(): BeamPosition {
  const choices: BeamPosition[] = ["LEFT", "CENTER", "RIGHT"];
  return choices[Math.floor(Math.random() * choices.length)] as BeamPosition;
}

function drawFromDeck(
  deck: MalfunctionId[],
  discard: MalfunctionId[]
): { card: MalfunctionId; nextDeck: MalfunctionId[]; nextDiscard: MalfunctionId[] } {
  let nextDeck = deck;
  let nextDiscard = discard;

  if (nextDeck.length === 0) {
    nextDeck = nextDiscard.length > 0 ? shuffle(nextDiscard) : shuffle(MALFUNCTION_IDS);
    nextDiscard = [];
  }

  if (nextDeck.length === 0) {
    throw new Error("Malfunction deck could not be refilled.");
  }

  const card = nextDeck[0] as MalfunctionId;
  return {
    card,
    nextDeck: nextDeck.slice(1),
    nextDiscard: [...nextDiscard, card],
  };
}

function mapEffectiveBeam(selected: BeamPosition, reversedControls: boolean): BeamPosition {
  if (!reversedControls) {
    return selected;
  }

  if (selected === "LEFT") {
    return "RIGHT";
  }

  if (selected === "RIGHT") {
    return "LEFT";
  }

  return "CENTER";
}

function sequenceToText(sequence: PanelSymbol[]): string {
  if (sequence.length === 0) {
    return "(none)";
  }

  return sequence.map((symbol) => SYMBOL_GLYPH[symbol]).join(" ");
}

function deriveBaseTarget(
  symbols: PanelSymbol[],
  symbolScramble: boolean
): { target: PanelSymbol; details: string[] } {
  const details: string[] = [];

  if (symbols.length === 0) {
    details.push("Scenario had no symbols. Defaulted to Circle mapping.");
    return { target: RULE_B_SINGLE_MAP.CIRCLE, details };
  }

  if (symbols.length === 1) {
    const target = RULE_B_SINGLE_MAP[symbols[0] as PanelSymbol];
    details.push(`Rule B used on ${SYMBOL_LABEL[symbols[0] as PanelSymbol]}.`);
    return { target, details };
  }

  const first = symbols[0] as PanelSymbol;
  const second = symbols[1] as PanelSymbol;

  if (symbolScramble) {
    const target = RULE_B_SINGLE_MAP[first];
    details.push("Symbol Scramble active: Rule B used on first symbol only.");
    return { target, details };
  }

  const key = `${first}_${second}`;
  const pairResult = RULE_A_PAIR_MAP[key];

  if (pairResult) {
    details.push("Rule A pair mapping applied.");
    return { target: pairResult, details };
  }

  const fallback = RULE_B_SINGLE_MAP[first];
  details.push("Pair not found in Rule A. Fell back to Rule B on first symbol.");
  return { target: fallback, details };
}

function evaluateRound(
  scenario: ScenarioCard,
  selectedBeam: BeamPosition,
  buttonLog: PanelSymbol[],
  activeMalfunctions: MalfunctionId[]
): {
  outcome: Outcome;
  details: string[];
  expectedSequence: PanelSymbol[];
  actualSequence: PanelSymbol[];
} {
  const details: string[] = [];
  const reversedControls = activeMalfunctions.includes("REVERSED_CONTROLS");
  const doubleInputRequired = activeMalfunctions.includes("DOUBLE_INPUT_REQUIRED");
  const symbolScramble = activeMalfunctions.includes("SYMBOL_SCRAMBLE");

  const effectiveBeam = mapEffectiveBeam(selectedBeam, reversedControls);
  if (effectiveBeam !== "CENTER") {
    details.push(`Beam failed: effective position was ${BEAM_LABEL[effectiveBeam]}, must be Center.`);
  } else {
    details.push("Beam check passed: effective position is Center.");
  }

  const base = deriveBaseTarget(scenario.symbols, symbolScramble);
  details.push(...base.details);

  let targetButton = base.target;

  if (scenario.status === "FLICKERING") {
    targetButton = FLICKER_REVERSE_MAP[targetButton];
    details.push("Flickering status reversed the target button.");
  }

  let requiredPresses = scenario.status === "ALERT" ? 2 : 1;
  if (scenario.status === "ALERT") {
    details.push("Alert status requires pressing the resolved button twice.");
  }

  if (doubleInputRequired) {
    requiredPresses *= 2;
    details.push("Double Input Required doubled the number of required presses.");
  }

  const expectedSequence = Array.from({ length: requiredPresses }, () => targetButton);
  const actualSequence = buttonLog;

  const sequenceMatches =
    expectedSequence.length === actualSequence.length &&
    expectedSequence.every((symbol, index) => symbol === actualSequence[index]);

  if (!sequenceMatches) {
    details.push(
      `Button mismatch: expected ${sequenceToText(expectedSequence)}, received ${sequenceToText(actualSequence)}.`
    );
  } else {
    details.push("Button sequence matched expected input.");
  }

  const outcome: Outcome = effectiveBeam === "CENTER" && sequenceMatches ? "SUCCESS" : "ERROR";
  return {
    outcome,
    details,
    expectedSequence,
    actualSequence,
  };
}

function createInitialState(): GameState {
  return {
    phase: "ROUND_SETUP",
    round: 1,
    progress: 0,
    errors: 0,
    winTarget: WIN_TARGET,
    lossTarget: LOSS_TARGET,
    autoDrawMalfunction: true,
    currentScenarioId: null,
    panelStatus: "STABLE",
    startingBeam: "CENTER",
    selectedBeam: "CENTER",
    buttonLog: [],
    activeMalfunctions: [],
    malfunctionDeck: shuffle(MALFUNCTION_IDS),
    malfunctionDiscard: [],
    lastResolution: null,
    roundHistory: [],
    outcomeText: null,
  };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "START_ROUND": {
      if (state.phase !== "ROUND_SETUP") {
        return state;
      }

      const scenario = getScenarioById(action.scenarioId);
      const beam = randomBeam();

      return {
        ...state,
        phase: "OPERATOR_ACTION",
        currentScenarioId: scenario.id,
        panelStatus: scenario.status,
        startingBeam: beam,
        selectedBeam: beam,
        buttonLog: [],
        outcomeText: null,
      };
    }

    case "SET_BEAM": {
      if (state.phase !== "OPERATOR_ACTION") {
        return state;
      }
      return {
        ...state,
        selectedBeam: action.beam,
      };
    }

    case "PRESS_SYMBOL": {
      if (state.phase !== "OPERATOR_ACTION") {
        return state;
      }

      return {
        ...state,
        buttonLog: [...state.buttonLog, action.symbol],
      };
    }

    case "CLEAR_QUEUE": {
      if (state.phase !== "OPERATOR_ACTION") {
        return state;
      }
      return {
        ...state,
        buttonLog: [],
      };
    }

    case "SUBMIT_ROUND": {
      if (state.phase !== "OPERATOR_ACTION" || state.currentScenarioId === null) {
        return state;
      }

      const scenario = getScenarioById(state.currentScenarioId);
      const evaluation = evaluateRound(
        scenario,
        state.selectedBeam,
        state.buttonLog,
        state.activeMalfunctions
      );

      const isSuccess = evaluation.outcome === "SUCCESS";
      const nextProgress = state.progress + (isSuccess ? 1 : 0);
      const nextErrors = state.errors + (isSuccess ? 0 : 1);

      let malfunctionDrawn: MalfunctionId | null = null;
      let nextDeck = state.malfunctionDeck;
      let nextDiscard = state.malfunctionDiscard;
      let nextActiveMalfunctions = state.activeMalfunctions;

      if (!isSuccess && state.autoDrawMalfunction) {
        const draw = drawFromDeck(state.malfunctionDeck, state.malfunctionDiscard);
        malfunctionDrawn = draw.card;
        nextDeck = draw.nextDeck;
        nextDiscard = draw.nextDiscard;

        if (!nextActiveMalfunctions.includes(malfunctionDrawn)) {
          nextActiveMalfunctions = [...nextActiveMalfunctions, malfunctionDrawn];
        }
      }

      const resolutionDetails = [...evaluation.details];
      if (malfunctionDrawn) {
        resolutionDetails.push(`Malfunction drawn: ${getMalfunctionById(malfunctionDrawn).name}.`);
      }

      const resolution: ResolutionRecord = {
        round: state.round,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        outcome: evaluation.outcome,
        details: resolutionDetails,
        expectedSequence: evaluation.expectedSequence,
        actualSequence: evaluation.actualSequence,
        malfunctionDrawn,
      };

      const entry: RoundLogEntry = {
        round: state.round,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        outcome: evaluation.outcome,
        malfunctionDrawn,
      };

      const reachedWin = nextProgress >= state.winTarget;
      const reachedLoss = nextErrors >= state.lossTarget;

      return {
        ...state,
        phase: reachedWin || reachedLoss ? "GAME_OVER" : "RESOLUTION",
        progress: nextProgress,
        errors: nextErrors,
        malfunctionDeck: nextDeck,
        malfunctionDiscard: nextDiscard,
        activeMalfunctions: nextActiveMalfunctions,
        lastResolution: resolution,
        roundHistory: [entry, ...state.roundHistory].slice(0, MAX_HISTORY),
        outcomeText: reachedWin
          ? "Abduction complete. Mission success."
          : reachedLoss
            ? "Five errors reached. Mission failed."
            : null,
      };
    }

    case "NEXT_ROUND": {
      if (state.phase !== "RESOLUTION") {
        return state;
      }

      return {
        ...state,
        phase: "ROUND_SETUP",
        round: state.round + 1,
        currentScenarioId: null,
        panelStatus: "STABLE",
        startingBeam: "CENTER",
        selectedBeam: "CENTER",
        buttonLog: [],
      };
    }

    case "TOGGLE_ACTIVE_MALFUNCTION": {
      if (state.phase === "OPERATOR_ACTION") {
        return state;
      }

      const isActive = state.activeMalfunctions.includes(action.id);
      return {
        ...state,
        activeMalfunctions: isActive
          ? state.activeMalfunctions.filter((id) => id !== action.id)
          : [...state.activeMalfunctions, action.id],
      };
    }

    case "CLEAR_ACTIVE_MALFUNCTION": {
      if (state.phase === "OPERATOR_ACTION") {
        return state;
      }

      return {
        ...state,
        activeMalfunctions: state.activeMalfunctions.filter((id) => id !== action.id),
      };
    }

    case "SET_AUTO_DRAW_MALFUNCTION": {
      return {
        ...state,
        autoDrawMalfunction: action.value,
      };
    }

    case "RESTART_MISSION": {
      return createInitialState();
    }

    default: {
      return state;
    }
  }
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`metric ${danger ? "metric-danger" : ""}`}>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </div>
  );
}

export default function Home() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const [scenarioInput, setScenarioInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  const currentScenario = useMemo(() => {
    if (state.currentScenarioId === null) {
      return null;
    }
    return getScenarioById(state.currentScenarioId);
  }, [state.currentScenarioId]);

  const activeMalfunctions = useMemo(
    () => state.activeMalfunctions.map((id) => getMalfunctionById(id)),
    [state.activeMalfunctions]
  );
  const hideIntel = true;

  function startRoundFromInput() {
    const parsed = Number.parseInt(scenarioInput, 10);
    if (!Number.isInteger(parsed)) {
      setInputError("Enter a scenario number from 1 to 10.");
      return;
    }

    if (!SCENARIO_CARDS.some((card) => card.id === parsed)) {
      setInputError("Scenario number not found. Use 1 through 10.");
      return;
    }

    dispatch({ type: "START_ROUND", scenarioId: parsed });
    setInputError(null);
    setScenarioInput("");
  }

  return (
    <div className="page-shell">
      <main className="page-main">
        <header className="hero">
          <div>
            <p className="kicker">First Iteration Prototype</p>
            <h1>Lifted Control Panel</h1>
            <p className="subtitle">
              Enter the physical scenario card number each round. Operator-only visibility is always enforced and
              communication is verbal only.
            </p>
          </div>
          <div className="hero-actions">
            <button type="button" className="btn ghost" onClick={() => dispatch({ type: "RESTART_MISSION" })}>
              Restart Mission
            </button>
          </div>
        </header>

        <section className="metrics-grid">
          <Metric label="Round" value={`${state.round}`} />
          <Metric label="Progress" value={`${state.progress}/${state.winTarget}`} />
          <Metric label="Errors" value={`${state.errors}/${state.lossTarget}`} danger />
          <Metric
            label="Phase"
            value={
              state.phase === "ROUND_SETUP"
                ? "Round Setup"
                : state.phase === "OPERATOR_ACTION"
                  ? "Operator Action"
                  : state.phase === "RESOLUTION"
                    ? "Resolution"
                    : "Game Over"
            }
          />
        </section>

        <section className="game-grid">
          <article className="panel card">
            <div className="section-head">
              <p className="section-kicker">Main Panel</p>
              <h2>
                {state.phase === "ROUND_SETUP"
                  ? "Round Setup"
                  : state.phase === "OPERATOR_ACTION"
                    ? "Operator Controls"
                    : state.phase === "RESOLUTION"
                      ? "Round Resolution"
                      : "Mission End"}
              </h2>
            </div>

            {state.phase === "ROUND_SETUP" ? (
              <div className="stack">
                <p className="text-soft">Input the scenario card number that was physically drawn.</p>

                <div className="setup-row">
                  <label htmlFor="scenario-input" className="field-label">
                    Scenario Number
                  </label>
                  <input
                    id="scenario-input"
                    type="number"
                    min={1}
                    max={10}
                    value={scenarioInput}
                    onChange={(event) => setScenarioInput(event.target.value)}
                    className="number-input"
                    placeholder="1-10"
                  />
                  <button type="button" className="btn primary" onClick={startRoundFromInput}>
                    Confirm Scenario and Begin
                  </button>
                </div>

                {inputError ? <p className="error-text">{inputError}</p> : null}

                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={state.autoDrawMalfunction}
                    onChange={(event) =>
                      dispatch({ type: "SET_AUTO_DRAW_MALFUNCTION", value: event.target.checked })
                    }
                  />
                  <span>Auto-draw a malfunction after each error</span>
                </label>

                <div className="sub-card">
                  <p className="sub-title">Current Active Malfunctions</p>
                  {MALFUNCTIONS.map((malfunction) => {
                    const checked = state.activeMalfunctions.includes(malfunction.id);
                    return (
                      <label key={malfunction.id} className="toggle-row">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => dispatch({ type: "TOGGLE_ACTIVE_MALFUNCTION", id: malfunction.id })}
                        />
                        <span>
                          {malfunction.name} - {malfunction.description}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {state.phase === "OPERATOR_ACTION" && currentScenario ? (
              <div className="stack">
                <div className="sub-card">
                  <p className="sub-title">Beam Alignment</p>
                  <p className="text-soft">Starting beam: {BEAM_LABEL[state.startingBeam]}</p>
                  <div className="beam-row">
                    {(["LEFT", "CENTER", "RIGHT"] as BeamPosition[]).map((beam) => (
                      <button
                        key={beam}
                        type="button"
                        className={beam === state.selectedBeam ? "btn beam active" : "btn beam"}
                        onClick={() => dispatch({ type: "SET_BEAM", beam })}
                      >
                        {BEAM_LABEL[beam]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sub-card">
                  <p className="sub-title">Status Indicator</p>
                  <p
                    className={`status-pill ${
                      state.panelStatus === "ALERT"
                        ? "status-alert"
                        : state.panelStatus === "FLICKERING"
                          ? "status-flicker"
                          : "status-stable"
                    }`}
                  >
                    {STATUS_LABEL[state.panelStatus]}
                  </p>
                </div>

                <div className="sub-card">
                  <p className="sub-title">Buttons</p>
                  <div className="symbol-grid">
                    {(Object.keys(SYMBOL_LABEL) as PanelSymbol[]).map((symbol) => (
                      <button
                        key={symbol}
                        type="button"
                        className="btn symbol"
                        onClick={() => dispatch({ type: "PRESS_SYMBOL", symbol })}
                      >
                        <span className="glyph">{SYMBOL_GLYPH[symbol]}</span>
                        <span>{SYMBOL_LABEL[symbol]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sub-card">
                  <p className="sub-title">Action Queue</p>
                  {state.buttonLog.length === 0 ? (
                    <p className="text-soft">No button presses yet.</p>
                  ) : (
                    <p className="queue">{state.buttonLog.map((symbol) => SYMBOL_GLYPH[symbol]).join(" ")}</p>
                  )}
                  <div className="action-row">
                    <button type="button" className="btn ghost" onClick={() => dispatch({ type: "CLEAR_QUEUE" })}>
                      Clear Queue
                    </button>
                    <button type="button" className="btn primary" onClick={() => dispatch({ type: "SUBMIT_ROUND" })}>
                      Submit Action
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {(state.phase === "RESOLUTION" || state.phase === "GAME_OVER") && state.lastResolution ? (
              <div className="stack">
                <div className="sub-card">
                  <p className="sub-title">Round {state.lastResolution.round} Result</p>
                  <p className={state.lastResolution.outcome === "SUCCESS" ? "result-ok" : "result-bad"}>
                    {state.lastResolution.outcome === "SUCCESS" ? "Success" : "Error"}
                  </p>
                  {hideIntel ? (
                    <p>Scenario details hidden in operator-only mode.</p>
                  ) : (
                    <>
                      <p>
                        Scenario #{state.lastResolution.scenarioId}: {state.lastResolution.scenarioTitle}
                      </p>
                      <p>Expected Queue: {sequenceToText(state.lastResolution.expectedSequence)}</p>
                    </>
                  )}
                  <p>Operator Queue: {sequenceToText(state.lastResolution.actualSequence)}</p>
                  {state.lastResolution.malfunctionDrawn ? (
                    <p>
                      Drawn Malfunction: {getMalfunctionById(state.lastResolution.malfunctionDrawn).name}
                    </p>
                  ) : null}
                  {hideIntel ? (
                    <p className="text-soft">Rule-by-rule resolution details are hidden in operator-only mode.</p>
                  ) : (
                    <ul className="list">
                      {state.lastResolution.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {state.phase === "RESOLUTION" ? (
                  <button type="button" className="btn primary" onClick={() => dispatch({ type: "NEXT_ROUND" })}>
                    Start Next Round
                  </button>
                ) : null}

                {state.phase === "GAME_OVER" ? (
                  <div className="sub-card">
                    <p className="sub-title">Mission Outcome</p>
                    <p>{state.outcomeText}</p>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => dispatch({ type: "RESTART_MISSION" })}
                    >
                      Start New Mission
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>

          <aside className="card side">
            <div className="section-head">
              <p className="section-kicker">Support</p>
              <h2>Mission Log</h2>
            </div>

            <div className="sub-card">
              <p className="sub-title">Active Malfunctions</p>
              {activeMalfunctions.length === 0 ? (
                <p className="text-soft">None active.</p>
              ) : (
                <ul className="list">
                  {activeMalfunctions.map((malfunction) => (
                    <li key={malfunction.id}>
                      <p>{malfunction.name}</p>
                      <p className="text-soft">{malfunction.description}</p>
                      {state.phase !== "OPERATOR_ACTION" ? (
                        <button
                          type="button"
                          className="btn tiny ghost"
                          onClick={() => dispatch({ type: "CLEAR_ACTIVE_MALFUNCTION", id: malfunction.id })}
                        >
                          Clear
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="sub-card">
              <p className="sub-title">Recent Rounds</p>
              {state.roundHistory.length === 0 ? (
                <p className="text-soft">No rounds resolved yet.</p>
              ) : (
                <ul className="list">
                  {state.roundHistory.map((entry) => (
                    <li key={`${entry.round}-${entry.scenarioId}-${entry.scenarioTitle}`}>
                      <p>
                        Round {entry.round}:{" "}
                        {hideIntel
                          ? `Scenario #${entry.scenarioId} (title hidden)`
                          : `Scenario #${entry.scenarioId} ${entry.scenarioTitle}`}
                      </p>
                      <p className="text-soft">
                        {entry.outcome === "SUCCESS" ? "Success" : "Error"}
                        {entry.malfunctionDrawn
                          ? ` | ${getMalfunctionById(entry.malfunctionDrawn).name}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="sub-card">
              <p className="sub-title">Quick Rules Reminder</p>
              <ul className="list">
                <li>Mission Control uses the physical manual and cannot see the screen.</li>
                <li>Use the physical scenario deck, then enter scenario # in setup.</li>
                <li>Beam must resolve to Center before action succeeds.</li>
                <li>Game ends at Progress 5 (win) or Errors 5 (loss).</li>
              </ul>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
