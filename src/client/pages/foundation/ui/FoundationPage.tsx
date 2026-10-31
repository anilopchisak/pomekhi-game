import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../../shared/protocol.js';
import styles from './FoundationPage.module.css';

export function FoundationPage() {
  const [connection, setConnection] = useState<'connecting' | 'ready' | 'offline'>('connecting');
  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();
    socket.on('server:ready', () => setConnection('ready'));
    socket.on('disconnect', () => setConnection('offline'));
    socket.on('connect_error', () => setConnection('offline'));
    return () => { socket.disconnect(); };
  }, []);
  const message = {
    connecting: 'Настраиваем сигнал…',
    ready: 'Связь с сервером установлена',
    offline: 'Сигнал потерян. Пробуем подключиться снова…',
  }[connection];
  return (
    <main className={styles.screen}>
      <p className={styles.frequency}>НЕИЗВЕСТНАЯ ЧАСТОТА · 07.11</p>
      <h1 className={styles.title}>ПОМЕХИ</h1>
      <p className={styles.intro}>В этом доме кто-то есть.</p>
      <p className={styles.status} role="status"><span aria-hidden="true">●</span> {message}</p>
      <p className={styles.note}>Основа приложения готова. Игровая комната, задания и раунды появятся на следующем этапе.</p>
    </main>
  );
}
