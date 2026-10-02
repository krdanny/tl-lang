// mocha's spec reporter, plus the totals written to the file named in TL_BENCH_STATS
'use strict'
const fs = require('node:fs')
const Mocha = require('mocha')

class Counting extends Mocha.reporters.Spec {
  constructor(runner, options) {
    super(runner, options)
    runner.once('end', () => {
      const { passes, failures, pending } = runner.stats
      fs.writeFileSync(process.env.TL_BENCH_STATS, JSON.stringify({ passes, failures, pending }))
    })
  }
}
module.exports = Counting
