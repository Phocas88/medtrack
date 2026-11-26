import { NextResponse } from 'next/server';
import { requireUser, routeError, HttpError } from '@/lib/server-auth';
import { uuid } from '@/lib/security';
import { createServiceClient } from '@/lib/supabase/service';
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const id = uuid.parse(new URL(request.url).searchParams.get('id'));
    const db = createServiceClient();
    const { data: document, error } = await db.from('documents').select('file_url').eq('id', id).eq('tenant_id', user.tenant_id).single();
    if (error || !document?.file_url?.startsWith(`${user.tenant_id}/`)) throw new HttpError(404, 'File not found');
    const { data, error: downloadError } = await db.storage.from('tenant-documents').createSignedUrl(document.file_url, 60, { download: true });
    if (downloadError || !data?.signedUrl) throw new HttpError(404, 'File not found');
    const response = NextResponse.redirect(data.signedUrl);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) { return routeError(error); }
}
