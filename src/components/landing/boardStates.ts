import type { BoardRow } from "./board/splitFlapEngine";

export const BOARD_ROWS = 5;
export const WIDE_COLUMNS = 30;
export const NARROW_COLUMNS = 18;

export type BoardStateId = "intro" | "trip" | "swap" | "sources" | "handoff";

type Variant = { wide: BoardRow[]; narrow: BoardRow[] };

const blank: BoardRow = { text: "", status: "off" };

// Wide rows use an 8 / 10 / 11 column grid; narrow rows must fit 18 characters.
export const BOARD_STATES: Record<BoardStateId, Variant> = {
  intro: {
    wide: [
      { text: "FIXED EVENT", status: "fixed" },
      { text: "FIXED BUDGET", status: "fixed" },
      { text: "FLEXIBLE ROUTE", status: "flex" },
      blank,
      blank,
    ],
    narrow: [
      { text: "FIXED EVENT", status: "fixed" },
      { text: "FIXED BUDGET", status: "fixed" },
      { text: "FLEXIBLE ROUTE", status: "flex" },
      blank,
      blank,
    ],
  },
  trip: {
    wide: [
      { text: "LEAVE   ISTANBUL  FROM 21 OCT", status: "flex" },
      { text: "STOP    BANGKOK   OPTIONAL", status: "swap" },
      { text: "EVENT   SINGAPORE 27–29 OCT", status: "fixed" },
      { text: "RETURN  ISTANBUL  BY 01 NOV", status: "fixed" },
      { text: "BUDGET  100 000 TRY", status: "fixed" },
    ],
    narrow: [
      { text: "LEAVE  FROM 21 OCT", status: "flex" },
      { text: "STOP   BANGKOK", status: "swap" },
      { text: "EVENT SG 27–29 OCT", status: "fixed" },
      { text: "RETURN BY 01 NOV", status: "fixed" },
      { text: "BUDGET 100000 TRY", status: "fixed" },
    ],
  },
  swap: {
    wide: [
      { text: "LEAVE   ISTANBUL  FROM 21 OCT", status: "flex" },
      { text: "STOP    TAIPEI    OPTIONAL", status: "swap" },
      { text: "EVENT   SINGAPORE 27–29 OCT", status: "fixed" },
      { text: "RETURN  ISTANBUL  BY 01 NOV", status: "fixed" },
      { text: "BUDGET  100 000 TRY", status: "fixed" },
    ],
    narrow: [
      { text: "LEAVE  FROM 21 OCT", status: "flex" },
      { text: "STOP   TAIPEI", status: "swap" },
      { text: "EVENT SG 27–29 OCT", status: "fixed" },
      { text: "RETURN BY 01 NOV", status: "fixed" },
      { text: "BUDGET 100000 TRY", status: "fixed" },
    ],
  },
  sources: {
    wide: [
      { text: "FLIGHTS           ESTIMATE", status: "flex" },
      { text: "HOTEL NIGHTS      ESTIMATE", status: "flex" },
      { text: "FOOD AND LOCAL    ESTIMATE", status: "flex" },
      { text: "SAFETY MARGIN     INCLUDED", status: "fixed" },
      { text: "TOTAL VS BUDGET   CHECKED", status: "fixed" },
    ],
    narrow: [
      { text: "FLIGHTS   ESTIMATE", status: "flex" },
      { text: "HOTELS    ESTIMATE", status: "flex" },
      { text: "LOCAL     ESTIMATE", status: "flex" },
      { text: "MARGIN    INCLUDED", status: "fixed" },
      { text: "BUDGET    CHECKED", status: "fixed" },
    ],
  },
  handoff: {
    wide: [
      { text: "WE COMPARE THE ROUTES", status: "off" },
      { text: "YOU BOOK WITH THE PROVIDER", status: "off" },
      { text: "WE NEVER SELL TICKETS", status: "off" },
      blank,
      { text: "PLAN YOUR TRIP BELOW", status: "flex" },
    ],
    narrow: [
      { text: "WE COMPARE", status: "off" },
      { text: "YOU BOOK WITH", status: "off" },
      { text: "THE PROVIDER", status: "off" },
      blank,
      { text: "PLAN YOUR TRIP", status: "flex" },
    ],
  },
};

export function rowsFor(state: BoardStateId, columns: number): BoardRow[] {
  return columns >= WIDE_COLUMNS ? BOARD_STATES[state].wide : BOARD_STATES[state].narrow;
}

// Plain-language reading of each state for screen readers and the CSS fallback caption.
export const BOARD_READOUT: Record<BoardStateId, string> = {
  intro: "Fixed event. Fixed budget. Flexible route.",
  trip:
    "Leave Istanbul from 21 October, flexible. Optional stop in Bangkok. Event in Singapore 27 to 29 October, fixed. Back in Istanbul by 1 November, fixed. Budget 100,000 Turkish lira, fixed.",
  swap:
    "The optional stop changes from Bangkok to Taipei. The Singapore event on 27 to 29 October, the return date and the budget stay fixed.",
  sources:
    "Price sources: flights, hotel nights, food and local transport are estimates. A safety margin is included. The total is checked against the budget.",
  handoff: "We compare the routes. You book with the provider. We never sell tickets. Plan your trip below.",
};
