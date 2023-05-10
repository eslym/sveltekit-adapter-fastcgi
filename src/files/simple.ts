import { start } from './server';
import { handle, boot } from './handle';

boot().then(() => start(handle));

export {};
