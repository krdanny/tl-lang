# Project 3 — Inventory manager (business rules and a state machine)

A command interpreter for a warehouse. It reads commands from a file, prints one line per command, and prints
a report on demand. Implement it from this spec only; output must be byte-identical for the shared fixtures.

## Running

`<program> <commands-file>` — one command per line; blank lines are ignored.

## Commands and responses

| Command | Effect | Success line |
|---|---|---|
| `add SKU NAME QTY` | new product with stock QTY, reserved 0 | `ok add SKU` |
| `receive SKU QTY` | stock += QTY | `ok receive SKU stock=N` |
| `order ID SKU QTY` | new order in state `Reserved`; reserved += QTY | `ok order ID` |
| `ship ID` | `Reserved` → `Shipped`; stock −= qty; reserved −= qty | `ok ship ID` |
| `return ID` | `Shipped` → `Returned`; stock += qty | `ok return ID` |
| `cancel ID` | `Reserved` → `Cancelled`; reserved −= qty | `ok cancel ID` |
| `report` | prints the report (below) | — |

Errors (checked in this order; the first that applies is printed):
- unknown command word: `error: unknown command WORD`
- `add` of an existing SKU: `error: product exists SKU`
- QTY that is not a positive integer: `error: invalid quantity`
- unknown SKU: `error: unknown product SKU`
- `order` with an existing ID: `error: order exists ID`
- `order` when `stock − reserved < QTY`: `error: insufficient stock for SKU (available N)`
- unknown order ID: `error: unknown order ID`
- wrong state: `error: order ID cannot ship from STATE` (likewise `return`, `cancel`)

## Report

```
inventory:
  SKU NAME stock=N reserved=N available=N     (sorted by SKU, ascending string order)
orders:
  ID SKU QTY STATE                            (in creation order)
```
