import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { areaForCoords, searchPlaces } from "@/lib/geo.server";
import { errorResponse, HttpError, requireUserId } from "@/lib/plants/server";
import { createClient } from "@/lib/supabase/server";

// GET ?q=address → up to 5 matches to choose from.
export async function GET(request: NextRequest) {
  try {
    await requireUserId(await createClient());
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2 || q.length > 200) throw new HttpError(400, "Type a street, city or postcode.");
    return NextResponse.json({ places: await searchPlaces(q) });
  } catch (error) {
    if (!(error instanceof HttpError)) console.error("location search failed", error);
    return error instanceof HttpError
      ? errorResponse(error)
      : NextResponse.json({ error: "Address search is unavailable right now. Please try again." }, { status: 502 });
  }
}

// POST {latitude, longitude} from the device → town-level area name.
const coordsSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });

export async function POST(request: NextRequest) {
  try {
    await requireUserId(await createClient());
    const parsed = coordsSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Invalid location.");
    const place = await areaForCoords(parsed.data.latitude, parsed.data.longitude);
    if (!place) throw new HttpError(404, "We couldn't find that place.");
    return NextResponse.json({ place });
  } catch (error) {
    if (!(error instanceof HttpError)) console.error("reverse geocode failed", error);
    return error instanceof HttpError
      ? errorResponse(error)
      : NextResponse.json({ error: "Location lookup is unavailable right now. Please try again." }, { status: 502 });
  }
}
