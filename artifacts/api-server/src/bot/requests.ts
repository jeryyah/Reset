export interface PendingRequest {
  id: string;
  userChatId: number;
  userId: number;
  firstName: string;
  lastName?: string;
  username?: string;
  key: string;
  submittedAt: number;
}

const pending = new Map<string, PendingRequest>();
let counter = 0;

const TTL_MS = 24 * 60 * 60 * 1000;

function generateId(): string {
  counter = (counter + 1) % 1000000;
  const ts = Date.now().toString(36).slice(-5);
  const seq = counter.toString(36);
  return `${ts}${seq}`;
}

export function createRequest(
  data: Omit<PendingRequest, "id">,
): PendingRequest {
  const id = generateId();
  const req: PendingRequest = { id, ...data };
  pending.set(id, req);
  const timer = setTimeout(() => {
    pending.delete(id);
  }, TTL_MS);
  timer.unref?.();
  return req;
}

export function getRequest(id: string): PendingRequest | undefined {
  return pending.get(id);
}

export function deleteRequest(id: string): void {
  pending.delete(id);
}
