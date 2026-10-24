async function request(path: string, options?: RequestInit) {
  const response = await fetch(`/api/boards${path}`, { ...options, cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Shared-list request failed (${response.status})`);
  }
  return response.json();
}

export async function createBoard(): Promise<{ boardId: string; ownerToken: string }> {
  return request("", { method: "POST" });
}

export async function boardActive(id: string): Promise<boolean> {
  const result = await request(`/${encodeURIComponent(id)}`);
  return result.active === true;
}

export async function deleteBoard(id: string, ownerToken: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${ownerToken}` } });
}
