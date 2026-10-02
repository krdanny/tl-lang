#!/usr/bin/env node
import { tl } from '../src/cli.js';

await tl(process.argv.slice(2));
