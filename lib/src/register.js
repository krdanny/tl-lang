// `node --import tl-lang/register app.tl` — run TL files directly, like `node --import tsx app.ts`.
import { register } from 'node:module';

register('./hooks.js', import.meta.url);
