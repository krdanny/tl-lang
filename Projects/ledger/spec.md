# Project 5 — Bank ledger with concurrent transfers

Processes a batch of concurrent transfer requests against a set of accounts, with overdraft rejection,
retries on transient failures and an interest run. `<program> <batch.json>` prints the statement.

## Input

```json
{ "accounts": [ { "id": "acc-01", "balance": "100.00" } ],
  "transfers": [ { "from": "acc-01", "to": "acc-02", "amount": "12.34", "delay": 30, "transient": 1 } ] }
```
Money is written with two decimals and must be handled as integer cents (no floating point).

## Processing

- All transfers start concurrently. A transfer waits `delay` milliseconds, then attempts to apply.
- The first `transient` attempts of a transfer fail with a transient error. After a transient failure the
  transfer retries immediately, at most 3 retries (4 attempts). If it still fails it is `failed`.
- Transfers with the same delay apply in input order (timers with equal delay fire in registration order).
- Applying is atomic: check and update happen without any interleaving. If the source balance is less than
  the amount, the transfer is `insufficient`; otherwise the amount moves and the transfer is `applied`.
- After every transfer has finished, add 1% interest to each positive balance, rounded half up to a cent.

## Output (exactly)

```
applied: N
insufficient: N
failed: N
retries: N            (total retry attempts)
<account id> <balance with two decimals>   (one per account, sorted by id)
```
