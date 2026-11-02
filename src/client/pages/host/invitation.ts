export function invitationUrl(address: string, roomCode: string, local = false) {
  const url = new URL(address.trim());
  const localHost = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname) && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.)/.test(url.hostname);
  if (!(url.protocol === 'https:' || local && url.protocol === 'http:' && localHost) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Enter an HTTPS origin without credentials, a path, query or fragment.');
  }
  url.searchParams.set('room', roomCode);
  return url.href;
}
