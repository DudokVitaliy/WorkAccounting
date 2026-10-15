export async function api<TResponse = unknown>(path: string, token: string, method = 'GET', data?: object): Promise<TResponse> {
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
    return {} as TResponse;
  try {
    return JSON.parse(text) as TResponse;
  }
  catch {
    throw new Error(`Сервер повернув некоректний JSON: ${path}`);
  }
}
