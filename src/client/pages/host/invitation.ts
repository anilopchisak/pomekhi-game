export function invitationUrl(address: string, roomCode: string) {
  const url = new URL(address.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Enter an HTTPS origin without credentials, a path, query or fragment.');
  }
  url.searchParams.set('room', roomCode);
  return url.href;
}
