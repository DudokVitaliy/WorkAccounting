import type { Row } from '../app/types';

export async function api(path: string, token: string, method = 'GET', data?: Row) {
  const response = await fetch('/api' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text.slice(0, 350) || `HTTP ${response.status}`);
  }
  if (!text.trim())
    return {};
  try {
    return JSON.parse(text);
  }
  catch {
    throw new Error(`Сервер повернув некоректний JSON: ${path}`);
  }
}
