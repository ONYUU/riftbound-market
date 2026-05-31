import { NextRequest, NextResponse } from "next/server";

const ALLOWED_IMAGE_HOSTS = new Set(["cmsassets.rgpub.io"]);

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing image URL." }, { status: 400 });
  }

  let imageUrl: URL;
  try {
    imageUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid image URL." }, { status: 400 });
  }

  if (!ALLOWED_IMAGE_HOSTS.has(imageUrl.hostname) && !imageUrl.hostname.endsWith(".supabase.co")) {
    return NextResponse.json({ error: "Image host is not allowed." }, { status: 400 });
  }

  const imageResponse = await fetch(imageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
    cache: "no-store",
  });

  const contentType = imageResponse.headers.get("content-type") || "image/png";
  if (!imageResponse.ok || !contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Image could not be loaded." }, { status: 404 });
  }

  return new NextResponse(imageResponse.body, {
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "Content-Type": contentType,
    },
  });
}
