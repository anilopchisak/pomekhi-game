import type { ReactNode } from 'react';
import type { ConnectionState } from '../api/index.js';
import styles from './LobbyShell.module.css';

export function LobbyShell({ title, connection, error, children, wide = false }: {
  title: string; connection: ConnectionState; error: string; children: ReactNode; wide?: boolean;
}) {
  const status = { connecting: 'Настраиваем сигнал…', online: 'Связь с домом установлена', offline: 'Сигнал потерян. Пробуем подключиться снова…' }[connection];
  return (
    <main className={`${styles.screen} ${wide ? styles.wide : ''}`}>
      <header>
        <p className={styles.frequency}>НЕИЗВЕСТНАЯ ЧАСТОТА · 07.11</p>
        <h1>ПОМЕХИ</h1>
        <p className={styles.intro}>В этом доме кто-то есть.</p>
        <p role="status" data-connection={connection}>● {status}</p>
      </header>
      <h2>{title}</h2>
      {error && <p role="alert">{error}</p>}
      {children}
    </main>
  );
}
