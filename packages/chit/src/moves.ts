/**
 * The Chit v0.1 conversational-move taxonomy.
 *
 * A turn has at most one primary move. The controller selects the move before
 * language generation; the generator only decides how the move is expressed.
 * The taxonomy is deliberately small and closed: new moves require a version
 * bump rather than an ad-hoc extension.
 */

/** The nine v0.1 primary moves, in canonical (deterministic tie-break) order. */
export const PRIMARY_MOVES = [
  "react",
  "riff",
  "ask",
  "challenge",
  "recall",
  "support",
  "ground",
  "shift",
  "breathe",
] as const;

export type PrimaryMove = (typeof PRIMARY_MOVES)[number];

/**
 * Candidates that are intentionally not primary moves.
 *
 * `expand` overlaps `riff`, so it is folded into it. `joke` is a style
 * modifier because humor can realize several different moves.
 */
export const NON_PRIMARY_CANDIDATES = ["expand", "joke"] as const;

export type NonPrimaryCandidate = (typeof NON_PRIMARY_CANDIDATES)[number];

/** Documentation attached to each move for prompt and fixture authorship. */
export interface MoveDefinition {
  readonly move: PrimaryMove;
  readonly intent: string;
  readonly useWhen: readonly string[];
  readonly commonFailures: readonly string[];
  readonly examples: readonly MoveExample[];
}

export interface MoveExample {
  readonly userTurn: string;
  readonly focus: string;
}

export const MOVE_DEFINITIONS: Readonly<Record<PrimaryMove, MoveDefinition>> = {
  react: {
    move: "react",
    intent:
      "Register the immediate substance, emotion, or absurdity of the user's turn without deliberately advancing the conversation.",
    useWhen: [
      "the turn mainly invites acknowledgment",
      "an immediate reaction is more natural than a question",
      "adding a direction would be premature",
    ],
    commonFailures: [
      "generic mirroring",
      "canned empathy",
      "repetition without presence",
      "unnecessary follow-up questions",
    ],
    examples: [
      { userTurn: "I finally finished the thing.", focus: "the completion" },
      { userTurn: "That meeting was completely surreal.", focus: "the absurdity" },
    ],
  },
  riff: {
    move: "riff",
    intent:
      "Add a related observation, association, interpretation, or possibility that gives the conversation somewhere interesting to go.",
    useWhen: [
      "the user introduces an idea worth playing with",
      "an adjacent thought is more valuable than interviewing the user",
      "the conversation benefits from contribution rather than extraction",
    ],
    commonFailures: [
      "turning the riff into a lecture",
      "drifting away from the active thread",
      "presenting speculation as fact",
      "disguising advice as observation",
    ],
    examples: [
      { userTurn: "Programming is starting to feel stale.", focus: "novelty versus competence" },
      {
        userTurn: "NYC gets strange after midnight.",
        focus: "how the city's social rules change at night",
      },
    ],
  },
  ask: {
    move: "ask",
    intent: "Invite the user to continue through one specific, naturally motivated opening.",
    useWhen: [
      "an important detail is missing",
      "the user appears to want to elaborate",
      "curiosity is more appropriate than interpretation",
    ],
    commonFailures: [
      "asking multiple questions",
      "conducting an intake interview",
      "reflexively ending with a question",
      "manufacturing continued engagement",
    ],
    examples: [
      { userTurn: "Work has been weird lately.", focus: 'what "weird" means here' },
      {
        userTurn: "You know what I've never understood?",
        focus: "inviting the unfinished thought",
      },
    ],
  },
  challenge: {
    move: "challenge",
    intent: "Push back on an opinion, interpretation, contradiction, or overly narrow framing.",
    useWhen: [
      "disagreement would make the conversation more honest",
      "the conclusion does not follow from the description",
      "a competing interpretation is valuable",
    ],
    commonFailures: [
      "contrarianism",
      "treating preference as error",
      "becoming prosecutorial",
      "hiding disagreement behind vague neutrality",
    ],
    examples: [
      { userTurn: "Anyone using that tool is lazy.", focus: "the generalization" },
      {
        userTurn: "If I am not excited, the project must be bad.",
        focus: "the implied equivalence",
      },
    ],
  },
  recall: {
    move: "recall",
    intent:
      "Reintroduce a relevant, established thread from prior conversation or supplied memory.",
    useWhen: [
      "the current turn meaningfully connects to something established",
      "a callback creates continuity",
      "the memory has clear provenance",
    ],
    commonFailures: [
      "forced callbacks",
      "irrelevant trivia",
      "treating inference as fact",
      "inventing or overstating memory",
    ],
    examples: [
      {
        userTurn: "I am not sure this job is stable.",
        focus: 'an earlier stated desire for a "boring environment"',
      },
      {
        userTurn: "I have been tinkering with this hardware project.",
        focus: "an earlier preference for physical, inspectable systems",
      },
    ],
  },
  support: {
    move: "support",
    intent:
      "Offer warmth, steadiness, encouragement, or company without necessarily endorsing a factual interpretation.",
    useWhen: [
      "the user expresses vulnerability, disappointment, or strain",
      "presence matters more than analysis",
      "advice would be premature",
    ],
    commonFailures: [
      "therapeutic clichés",
      "excessive reassurance",
      "validating an unsupported claim",
      "implying dependence or exclusivity",
    ],
    examples: [
      {
        userTurn: "I'm exhausted and I don't want to solve anything tonight.",
        focus: "company without problem-solving",
      },
      {
        userTurn: "I know I did what I could, but waiting still hurts.",
        focus: "steadiness without confirming the feared outcome",
      },
    ],
  },
  ground: {
    move: "ground",
    intent:
      "Preserve factual or epistemic integrity by qualifying, correcting, or declining to adopt an unsupported premise.",
    useWhen: [
      "the response would otherwise treat uncertainty as fact",
      "a false or unsupported claim is central",
      "the distinction between feeling and evidence matters",
    ],
    commonFailures: [
      "correcting harmless shorthand",
      "ignoring the emotional point",
      "overwhelming the conversation with caveats",
      "treating uncertainty as proof that the premise is false",
    ],
    examples: [
      {
        userTurn: "They did not reply today, so they rejected me.",
        focus: "the unsupported causal conclusion",
      },
      {
        userTurn: "Everyone agrees this model is conscious.",
        focus: "the unestablished consensus and claim",
      },
    ],
  },
  shift: {
    move: "shift",
    intent: "Move to another topic, frame, or open thread.",
    useWhen: [
      "the current thread has exhausted itself",
      "the user signals a pivot",
      "another thread is more alive",
      "continuing would become repetitive",
    ],
    commonFailures: [
      "derailing an unfinished disclosure",
      "changing topics to avoid discomfort",
      "introducing an unrelated task",
      "making an unrecognizable callback",
    ],
    examples: [
      { userTurn: "Anyway, enough job talk.", focus: "the user's pivot" },
      {
        userTurn: "And that was the end of that saga.",
        focus: "reconnecting to another active topic",
      },
    ],
  },
  breathe: {
    move: "breathe",
    intent:
      "Leave conversational room through a minimal acknowledgment, restrained response, or natural stopping point.",
    useWhen: [
      "the user appears complete",
      "a larger response would crowd the moment",
      "no new direction is needed",
      "conversational silence is preferable to forced productivity",
    ],
    commonFailures: [
      "sounding dismissive",
      "repeatedly using a stock acknowledgment",
      "withholding requested help",
      "treating every low-energy turn as closure",
    ],
    examples: [
      { userTurn: "Yeah. That's really it.", focus: "restraint" },
      {
        userTurn: "I think I'm going to leave it there tonight.",
        focus: "a natural stopping point",
      },
    ],
  },
};

export function isPrimaryMove(value: unknown): value is PrimaryMove {
  return typeof value === "string" && (PRIMARY_MOVES as readonly string[]).includes(value);
}
