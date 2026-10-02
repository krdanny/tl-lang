#!/usr/bin/env node
import { tlc } from '../src/cli.js';

await tlc(process.argv.slice(2));
