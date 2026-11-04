import { useEffect, useState } from 'react';

export function FullscreenButton() {
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [message, setMessage] = useState('');

  useEffect(() => {
    function update() {
      setFullscreen(Boolean(document.fullscreenElement));
      setMessage('');
    }
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  async function toggle() {
    setMessage('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.fullscreenEnabled) await document.documentElement.requestFullscreen();
      else setMessage('Полноэкранный режим недоступен в этом браузере.');
    } catch {
      setMessage('Не удалось переключить полноэкранный режим.');
    }
  }

  return <>
    <button type="button" data-secondary onClick={() => void toggle()}>
      {fullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
    </button>
    {message && <p role="status">{message}</p>}
  </>;
}
