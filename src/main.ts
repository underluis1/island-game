import { Game } from './game/game';
import { installDebugApi } from './game/debug';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
// the automation API exists only in development builds or when explicitly requested with ?debug
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) installDebugApi(game);
void game.boot();
