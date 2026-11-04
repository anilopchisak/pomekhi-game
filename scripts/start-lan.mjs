import { startLocal } from './start-server.mjs';

startLocal({ lan: true, createRoom: process.argv.includes('--create-room') });
