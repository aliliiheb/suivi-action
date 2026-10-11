let csrf = '';
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/plans${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      'Le serveur est indisponible. Réessayez dans quelques instants.',
      response.status,
    );
  }
  if (!response.ok)
    throw new ApiError(
      `${data.message || 'Échec de la requête.'}${Array.isArray(data.details) ? ' ' + data.details.join(' · ') : ''}`,
      response.status,
    );
  if (data?.csrf) csrf = data.csrf;
  return data;
}
