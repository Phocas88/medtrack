import { requireUser, routeError, HttpError } from '@/lib/server-auth';

export async function POST() {
  try {
    await requireUser(undefined, true);
    throw new HttpError(503, 'Card payments are unavailable until secure card collection is configured. No card has been charged.');
  } catch (error) { return routeError(error); }
}
