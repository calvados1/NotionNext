import { NextRequest, NextResponse } from 'next/server'

// Personal-blog mode: authentication and membership routes are disabled.
// Keep this edge middleware independent of Clerk and server-side utilities.
export const config = {
  matcher: ['/((?!_next/|.*\\.).*)', '/(api|trpc)(.*)']
}

export default async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  const route = pathname.replace(/^\/(?:[a-z]{2}(?:-[a-zA-Z]{2})?)(?=\/|$)/, '') || '/'
  if (/^\/(?:dashboard|admin|user|sign-in|sign-up|auth|trpc)(?:\/|$)/i.test(route) ||
      /^\/api\/(?:auth|user|admin|membership)(?:\/|$)/i.test(route)) {
    return new NextResponse('Not Found', { status: 404 })
  }

  // Resolve legacy Notion UUID links only when the requested path is a UUID.
  // Do not fetch redirect.json on every normal page request.
  const lastPart = pathname.split('/').filter(Boolean).pop() || ''
  const compact = lastPart.replace(/-/g, '')
  if (!/^[a-f0-9]{32}$/i.test(compact)) return NextResponse.next()

  const id = compact.toLowerCase().replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'
  )
  try {
    const response = await fetch(new URL('/redirect.json', req.url))
    if (response.ok) {
      const redirects = (await response.json()) as Record<string, string>
      const target = redirects[id] || redirects[lastPart]
      if (typeof target === 'string' && target) {
        const url = req.nextUrl.clone()
        url.pathname = '/' + target.replace(/^\/+/, '')
        if (url.pathname !== pathname) return NextResponse.redirect(url, 308)
      }
    }
  } catch (error) {
    console.error('[blog middleware] UUID redirect lookup failed', error)
  }
  return NextResponse.next()
}
