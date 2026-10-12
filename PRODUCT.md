# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

One Next.js TypeScript application shared by frontend and backend, as agreed in AGENTS.md. Desktop-first; smaller screens must still work without breaking.

## Users

People who want to travel but always have a fixed budget. Their trip is anchored to something with fixed dates, such as an event they must attend, and they want to get the most out of the trip around it without spending more than they have.

The launch scenario is one traveler leaving Istanbul for SWITCH in Singapore (October 27–29, 2026), with an optional stop in Bangkok or Taipei, a budget of 100,000 TRY, and a return by November 1.

## Product Purpose

EventHopper compares a small, disclosed set of trip routes that work around a fixed event and a fixed budget. It covers flights, hotel stays, known event costs and at most one optional city. Deterministic code checks event dates and travel chronology and totals every cost exactly. When the traveler swaps the optional city, it recalculates. To book, the traveler opens the provider's own public page; EventHopper never books or sells.

Success means the traveler can see which feasible routes fit the budget, what each one trades off, and which costs are verified, estimated or still unknown.

## Positioning

The event dates and the budget are fixed; the route around them is not. Attending the event is a hard constraint that is never relaxed to save money. No trip is called "within budget" while any required cost is unknown. Every price shows where it came from and how fresh it is.

## Operating Context

- People use EventHopper before they book. They compare options, then hand off to provider pages.
- Inputs are origin, departure window, return deadline, budget in TRY, hotel preference and one optional city.
- The first showing is a two-minute live demo at the OpenAI × Istanbul Codex Hackathon on October 12, 2026. Its key moment is replacing Bangkok with Taipei while the Singapore event dates stay protected.

## Capabilities and Constraints

- The first version covers one adult, one room, economy class, one fixed event and at most one optional city (Bangkok or Taipei). Trips start in Istanbul and are priced in TRY.
- Feasibility, money, dates and ranking come from deterministic backend code. AI only interprets requests and explains results that were already computed.
- Each price is labelled live, cached, estimated or sandbox, and keeps its original timestamp. An unknown cost stays unknown and is never counted as zero.
- Results are the best among the options searched, not a global optimum. Over-budget options appear only when nothing fits, and they are labelled over budget.
- There are no bookings, payments, accounts or maps.
- Synthetic demo data always carries the label "Demo data — synthetic, not live offers" and is never shown as a real offer.

## Brand Commitments

- The product name is EventHopper.
- The landing experience is built with three.js and uses realistic 3D models with polished animation.

## Evidence on Hand

- The official SWITCH site (https://www.switchsg.org/) is the event reference.
- There are no testimonials, user counts, partners, press, savings figures or live price quotes yet, and none may be invented. A price can appear only if a provider actually returned it or if it is clearly labelled synthetic.

## Product Principles

1. **Fixed points come first.** The event dates and the budget are the anchors, and everything else bends around them.
2. **Show the math.** Every total breaks down into line items, each with its source and freshness.
3. **Be honest about gaps.** Missing prices, partial search coverage and stale quotes are shown, never hidden.
4. **Compare, then hand off.** EventHopper helps people decide; the provider handles the booking.
