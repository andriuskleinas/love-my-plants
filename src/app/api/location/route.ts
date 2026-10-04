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
    if (q.length < 2 || q.length > 200) throw new HttpError(400, "Type at least 2 letters of a street, city or postcode to search.");
    return NextResponse.json({ places: await searchPlaces(q) });
  } catch (error) {
    if (!(error instanceof HttpError)) console.error("location search failed", error);
    return error instanceof HttpError
      ? errorResponse(error)
      : NextResponse.json({ error: "The address search service isn't responding right now. Try again in a minute, or tap Use my current location." }, { status: 502 });
  }
}

// POST {latitude, longitude} from the device → town-level area name.
const coordsSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });

export async function POST(request: NextRequest) {
  try {
    await requireUserId(await createClient());
    const parsed = coordsSchema.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, "Your device sent a location we couldn't use. Try again, or search by address instead.");
    const place = await areaForCoords(parsed.data.latitude, parsed.data.longitude);
    if (!place) throw new HttpError(404, "We couldn't find a town for your current location. Search by address instead.");
    return NextResponse.json({ place });
  } catch (error) {
    if (!(error instanceof HttpError)) console.error("reverse geocode failed", error);
    return error instanceof HttpError
      ? errorResponse(error)
      : NextResponse.json({ error: "The location service isn't responding right now. Try again in a minute, or search by address instead." }, { status: 502 });
  }
}
