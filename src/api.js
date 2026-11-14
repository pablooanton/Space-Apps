export const standalone = import.meta.env.VITE_DATA_MODE === 'static';
export async function request(path, options) {
  if (standalone) return (await import('./static-api')).staticRequest(path, options);
  return fetch(path, options);
}
