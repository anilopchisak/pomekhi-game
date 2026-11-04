import type { ReactNode } from 'react';
import type { ConnectionState } from '../api/index.js';
import styles from './LobbyShell.module.css';

export function LobbyShell({ title, connection, error, children, wide = false, toolbar }: {
  title: string; connection: ConnectionState; error: string; children: ReactNode; wide?: boolean; toolbar?: ReactNode;
}) {
  const status = { connecting: 'Настраиваем сигнал…', online: 'Связь установлена', offline: 'Сигнал потерян. Пробуем подключиться снова…' }[connection];
  return (
    <main className={`${styles.screen} ${wide ? styles.wide : ''}`}>
      <header className={styles.header}>
        <h1>ОДЕРЖИМЫЕ</h1>
        {toolbar ?? <span role="status" data-connection={connection}>{status}</span>}
      </header>
      {!toolbar && <h2>{title}</h2>}
      {error && <p role="alert">{error}</p>}
      {children}
    </main>
  );
}
